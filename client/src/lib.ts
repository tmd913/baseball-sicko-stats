import type {
  BaseEvent,
  BaseEventKind,
  BaseState,
  BattingLine,
  PitchingCredit,
  PitchingLine,
  PlateAppearance,
  GameStatus,
  PlayerGame,
  PlayerKind,
  PlayerReport,
  PlayerStatus,
  RosterStatus,
} from './types';
import { playerKey } from './types';

/**
 * ESPN's eligibility vocabulary, split by the kind of player it describes.
 *
 * The app reads a fantasy position in three places — the research board's pills
 * and Pos cell, and the chip on a player card — and every one of them is about
 * players of *one* kind at a time, so every one of them reads only its own half
 * of the list. That is what makes a bad join harmless rather than absurd: ESPN
 * has the Yankees' Fernando Cruz eligible at 2B and SS (the name-and-club join
 * having found the wrong man of a duplicate name), and filtered to the pitching
 * half that is an empty list — which is the fallback — instead of a second
 * baseman with an ERA. It is also what gives a two-way player one answer per
 * card: Ohtani comes back `DH, SP`, and his bat's card says DH where his arm's
 * says SP.
 *
 * The player page is the deliberate exception and prints the list whole, being
 * the one place in the app with room for it.
 */
export const ELIGIBLE_BY_KIND: Record<PlayerKind, ReadonlySet<string>> = {
  batter: new Set(['C', '1B', '2B', '3B', 'SS', 'OF', 'DH']),
  pitcher: new Set(['SP', 'RP']),
};

/**
 * The half of an ESPN eligibility list that a view of this kind speaks, or null
 * where that leaves nothing — an empty list after the filter being the same
 * thing as no list at all, and what every caller's own fallback is for.
 */
export function eligibleForKind(
  eligible: readonly string[] | null | undefined,
  kind: PlayerKind,
): string[] | null {
  if (!eligible) return null;
  const list = eligible.filter((p) => ELIGIBLE_BY_KIND[kind].has(p));
  return list.length > 0 ? list : null;
}

/**
 * **How many codes a position chip prints before it starts counting.**
 *
 * Two, and the number is a phone's line rather than a preference. The widest
 * list in the league is `1B/2B/3B/SS/OF` — fourteen characters — and a card's
 * header is a name and this chip on **one** line, where the uncapped list wraps
 * 8 of 14 names at 390px and 13 of 14 at 360, against the 1 and 2 that wrap
 * today. Two plus a count is bounded at seven characters (`2B/SS+3`), which is
 * the form a fantasy site prints in a roster row, and is the whole list for 533
 * of the 628 matched batters.
 *
 * **The card chip is now the only thing this governs.** The research board's
 * Pos cell took the same cap for a while, on the argument that the column hugs
 * its content on the app's widest table and every pixel of it is a stat off the
 * right edge — measured at 390px, 39px of column for a single code, 65 capped,
 * 108 whole. It prints the list whole now (see `positionOrder`): that cell is
 * where a filtered row says why it is on screen, and a table that already
 * scrolls sideways has 43px to spend on saying it. The player page prints it
 * whole too, and always has.
 */
const POS_CHIP_MAX = 2;

/**
 * A position chip's text, and the ordered list behind it for the tooltip.
 *
 * Two rules beyond the cap. **DH reads only when it is all he has**: ESPN
 * grants it to a third of the batters who are eligible somewhere else as well,
 * so `C/DH` spends half a chip on the half that says least — but for the ~33
 * players it is the whole of (a Luken Baker, an Ohtani's bat) it is the only
 * true answer there is. And **`lead` codes are hoisted to the front**, which is
 * what makes a cap safe on the board: a reader who has filtered to SS and sees
 * a utility man on row four reads `SS/2B+2` rather than a truncation that has
 * quietly dropped the one position that put him there. A card has no filter to
 * hoist for and passes none.
 */
export function positionCodes(
  codes: string[],
  lead?: string[],
): { ordered: string[]; text: string } {
  const trimmed = codes.length > 1 ? codes.filter((p) => p !== 'DH') : codes;
  const ordered = positionOrder(trimmed, lead);
  const shown = ordered.slice(0, POS_CHIP_MAX);
  const extra = ordered.length - shown.length;
  return { ordered, text: shown.join('/') + (extra > 0 ? `+${extra}` : '') };
}

/**
 * The same list, hoisted the same way, with neither the cap nor the DH rule.
 *
 * Both of those are the *chip's* rules rather than the list's, and both are
 * paid for by a width that only the chip is short of: two codes and a count is
 * what keeps a name and its chip on one phone line, and dropping DH is what
 * stops the two slots a cap allows being spent on the one position no filter
 * can select. The research board's Pos cell has no such line to hold — it hugs
 * its own content in a table that scrolls sideways regardless — so it prints
 * what the app actually knows, DH included, and the `+3` that used to stand in
 * for three quarters of a utility man's eligibility is gone. The hoist stays
 * either way: it costs nothing, and it is what puts the position a reader has
 * filtered to at the front of the cell that is there to say why the row is on
 * screen.
 */
export function positionOrder(codes: string[], lead?: string[]): string[] {
  const hoisted = lead ? codes.filter((p) => lead.includes(p)) : [];
  return hoisted.length ? [...hoisted, ...codes.filter((p) => !hoisted.includes(p))] : codes;
}

/**
 * MLB's listed position in ESPN's vocabulary — the batting-side fallback for a
 * player ESPN has no eligibility for, which is every player for a user with no
 * league connected.
 *
 * It lives here rather than on the research board because both tables that draw
 * an identity block need it and there is one answer: `LF`/`CF`/`RF` collapse to
 * `OF`, since neither the board's pills nor the block's line has an outfield
 * finer than one. A position not in the map — `TWP`, or nothing on record —
 * yields no code at all, which is what sends the cell to its last branch.
 */
export const MLB_TO_ELIGIBLE: Record<string, string> = {
  C: 'C',
  '1B': '1B',
  '2B': '2B',
  '3B': '3B',
  SS: 'SS',
  LF: 'OF',
  CF: 'OF',
  RF: 'OF',
  OF: 'OF',
  DH: 'DH',
};

/**
 * What the position half of an identity block prints, and what its tooltip
 * says — one definition for the research board's cell and the summary table's,
 * which is the whole reason it is here rather than on either of them.
 *
 * The rule is three-deep and identical on both. **ESPN's eligibility if there
 * is any**, narrowed to the half this kind of player speaks (`eligibleForKind`)
 * so a mis-joined pitcher reads his fallback rather than `2B/SS`. Otherwise the
 * app's own answer, which differs by kind because the two have different things
 * to fall back *to*: a batter has MLB's listed position, where a pitcher's is
 * `P`, a word no reader can act on — so his is whether he **starts**. And if
 * that leaves nothing in the vocabulary at all, MLB's own spelling, which on
 * the batting side is a two-way player's `TWP` or a position nobody has on
 * record. A pitching row can never reach the third branch, `starter` always
 * being there.
 *
 * The **whole list** is printed, uncapped: that is the board's rule (see
 * `positionOrder`) and it is the summary table's for the same reason — the
 * sub-line is narrower than the name above it either way, so the cap the card
 * chip pays for buys neither table a pixel. `lead` hoists the pill a reader has
 * filtered to; a roster table has no pill and passes none.
 *
 * The tooltip **names the source**, because `SS` alone cannot say whether it is
 * ESPN's answer or the app's guess, and the two callers phrase the fallback
 * differently — a board's `starter` is measured over its window, a report's
 * over the season — so each supplies its own wording.
 */
export interface PositionFacts {
  eligible: readonly string[] | null | undefined;
  kind: PlayerKind;
  /** MLB's listed position abbreviation, for the batting-side fallback. */
  position: string | null;
  /** Whether he starts, for the pitching-side one. */
  starter: boolean;
}

/**
 * The codes themselves, with no tooltip and no hoist — the three-deep rule
 * above, and the half of it a *filter* wants. The research board's position
 * pills read this while the cell beside them reads `positionCell`, so a pill
 * and the row it lets through can never come to disagree about where a man is
 * eligible.
 */
export function eligibleCodes(f: PositionFacts): string[] {
  const espn = eligibleForKind(f.eligible, f.kind);
  if (espn) return espn;
  if (f.kind === 'pitcher') return [f.starter ? 'SP' : 'RP'];
  const one = f.position ? MLB_TO_ELIGIBLE[f.position] : undefined;
  return one ? [one] : [];
}

export function positionCell(
  input: PositionFacts & {
    /** Codes to pull to the front — the board's active pill; none on a roster. */
    lead?: string[];
    /** How the tooltip describes the pitching fallback ("over the window",
     *  "this season"), the only phrase the two callers disagree about. */
    starterSource: string;
    /** The tooltip when MLB's own position is all there is. */
    unknownTitle: (position: string) => string;
  },
): { text: string; title: string } {
  const espn = eligibleForKind(input.eligible, input.kind);
  const codes = eligibleCodes(input);
  if (codes.length === 0) {
    return {
      text: input.position || '—',
      title: input.position ? input.unknownTitle(input.position) : 'No position listed',
    };
  }
  const ordered = positionOrder(codes, input.lead);
  const title = espn
    ? `Eligible in ESPN at ${ordered.join(', ')}`
    : input.kind === 'pitcher'
      ? `${ordered[0]} — ${input.starterSource}; ESPN has no eligibility for him`
      : `${ordered.join(', ')} — MLB's listed position; ESPN has no eligibility for him`;
  return { text: ordered.join('/'), title };
}

/**
 * Which side of the plate he stands on, or which arm he throws with — the one
 * fact of the pair that is about the half of him the caller is drawing.
 *
 * **One token per kind, and that is the whole design.** A batter's row says
 * `RHB`, a pitcher's says `RHP`, and a two-way player says one on each of his
 * two pages because the app is two entries about him and each is about a
 * different half. That is the rule `positionCell` beside it already follows
 * (`eligibleForKind` narrows Ohtani's bat to `DH` and his arm to `SP`), and
 * here it is the *useful* reading as well as the consistent one: which arm a
 * designated hitter throws with decides nothing, and nor does which side a
 * closer bats from. Drawing both on the player page — the one surface with the
 * room — was tried and rejected for exactly that: it would make handedness the
 * single fact on the page describing a half of him the page is not about.
 *
 * **The words are the app's own, extended rather than invented.** `RHP` and
 * `LHP` are already everywhere — the summary table's opponent cell (`RHP
 * Alcantara`), the feed's Upcoming bar, the Splits card's `vs LHP`, the next
 * game's line — so the batting side is that vocabulary said of a batter:
 * `RHB` / `LHB`, and `SH` for a switch hitter, which is the term itself rather
 * than a fourth letter pattern. Three characters, and no position code collides
 * with any of them, which is what lets the token sit unlabeled on a line that
 * already holds `1B/3B`.
 *
 * **Anything that is not `R`, `L` or `S` draws nothing.** MLB files two
 * ambidextrous *position players* as `pitchHand: 'S'` on a checked season, and
 * there is no honest word for a switch-throwing pitcher, so absence is the
 * answer — the same direction every join in this app fails in.
 */
export function handCell(
  kind: PlayerKind,
  hand: { bats: string | null; throws: string | null } | null | undefined,
): { text: string; title: string } | null {
  if (!hand) return null;
  if (kind === 'pitcher') {
    if (hand.throws === 'R') return { text: 'RHP', title: 'Throws right-handed' };
    if (hand.throws === 'L') return { text: 'LHP', title: 'Throws left-handed' };
    return null;
  }
  if (hand.bats === 'R') return { text: 'RHB', title: 'Bats right-handed' };
  if (hand.bats === 'L') return { text: 'LHB', title: 'Bats left-handed' };
  if (hand.bats === 'S') return { text: 'SH', title: 'Switch hitter — bats from both sides' };
  return null;
}

/** Category used for color-coding an outcome. */
export type OutcomeKind = 'hr' | 'hit' | 'walk' | 'out' | 'strikeout' | 'other';

export function outcomeKind(event: string | null): OutcomeKind {
  switch (event) {
    case 'home_run':
      return 'hr';
    case 'single':
    case 'double':
    case 'triple':
      return 'hit';
    case 'walk':
    case 'intent_walk':
    case 'hit_by_pitch':
      return 'walk';
    case 'strikeout':
    case 'strikeout_double_play':
      return 'strikeout';
    case null:
    case undefined:
      return 'other';
    default:
      return 'out';
  }
}

const EVENT_LABELS: Record<string, string> = {
  single: 'Single',
  double: 'Double',
  triple: 'Triple',
  home_run: 'Home Run',
  walk: 'Walk',
  intent_walk: 'Intentional Walk',
  hit_by_pitch: 'Hit By Pitch',
  strikeout: 'Strikeout',
  strikeout_double_play: 'Strikeout DP',
  field_out: 'Field Out',
  force_out: 'Force Out',
  grounded_into_double_play: 'GIDP',
  double_play: 'Double Play',
  sac_fly: 'Sac Fly',
  sac_bunt: 'Sac Bunt',
  field_error: 'Reached On Error',
  fielders_choice: "Fielder's Choice",
  fielders_choice_out: "Fielder's Choice",
  catcher_interf: 'Catcher Interference',
};

export function eventLabel(event: string | null): string {
  if (!event) return 'In Progress';
  return EVENT_LABELS[event] ?? event.replace(/_/g, ' ');
}

/** A compact box-score style line, e.g. "2-4, HR, BB". */
/**
 * OPS for a batting line (a single game or an aggregated range).
 *
 * **The denominator is `AB + BB + HBP + SF`**, which is on-base percentage's
 * real one and not the one this function used to divide by. The line carried no
 * sacrifice fly, so it divided by `AB + BB + HBP` and every OPS in the app ran
 * a hair high — measured against the live fantasy league's own scoreboard, a
 * manager's eleven-day lineup read `.824` against ESPN's `.8221`, and the whole
 * of the gap was two sacrifice flies (143/428 against 143/430). `sf` is on the
 * line now; see `types.ts::BattingLine`.
 *
 * Returns null when there's no on-base opportunity to divide by — which after
 * this change means a line of nothing *but* sacrifices no longer qualifies:
 * a sacrifice is an on-base opportunity that was not taken, and `0/1` is the
 * honest OBP for it rather than a dash.
 */
export function lineOps(line: BattingLine): number | null {
  const obpDen = line.ab + line.bb + line.hbp + line.sf;
  if (obpDen === 0) return null;
  const obp = (line.hits + line.bb + line.hbp) / obpDen;
  const slg = line.ab > 0 ? line.totalBases / line.ab : 0;
  return obp + slg;
}

/** A rate stat printed the baseball way: three decimals, no leading zero (".812", "1.250").
 *
 * **This form is for the rates baseball actually writes that way** — AVG, OBP,
 * SLG, OPS, ISO, BABIP, wOBA/xwOBA, xBA/xSLG and batting average against. A
 * *share* of something — K%, BB%, whiff, chase, barrel — is a percentage and
 * takes `ratePercent` below, or a `%` formatter of its own. The two are not
 * interchangeable: a column headed `K%` reading `.261` is the app printing a
 * share in the notation it reserves for a slash line. */
export function formatRate(n: number): string {
  const s = n.toFixed(3);
  return s.startsWith('0.') ? s.slice(1) : s;
}

/**
 * A share the server sent down as a `.xxx` string, printed as the percentage it
 * is — `".261"` → `"26.1%"`.
 *
 * Two server-side lines carry a share in that shape: `PitcherSeasonStats`'s
 * `kRate`/`bbRate` (per batter faced) and `TeamHittingLine`'s (per plate
 * appearance). Three decimals is a reasonable thing to put on the wire and the
 * wrong thing to put on screen, so the conversion lives here — once, so a
 * pitcher's K% cannot read two ways in one app. One decimal, which is what
 * every other percentage in the app prints. `str()` on the server yields an
 * em-dash where it has nothing, so the unparseable case is the ordinary one.
 */
export function ratePercent(rate: string | null | undefined): string {
  if (rate === null || rate === undefined || rate === '') return '—';
  const n = Number(rate);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—';
}

export function lineSummary(line: BattingLine): string {
  const parts: string[] = [`${line.hits}-${line.ab}`];
  const extras: string[] = [];
  if (line.runs) extras.push(`${line.runs} R`);
  if (line.hr) extras.push(line.hr > 1 ? `${line.hr} HR` : 'HR');
  if (line.triples) extras.push(line.triples > 1 ? `${line.triples} 3B` : '3B');
  if (line.doubles) extras.push(line.doubles > 1 ? `${line.doubles} 2B` : '2B');
  if (line.rbi) extras.push(`${line.rbi} RBI`);
  if (line.sb) extras.push(line.sb > 1 ? `${line.sb} SB` : 'SB');
  if (line.bb) extras.push(line.bb > 1 ? `${line.bb} BB` : 'BB');
  if (line.so) extras.push(line.so > 1 ? `${line.so} K` : 'K');
  if (line.hbp) extras.push('HBP');
  const ops = lineOps(line);
  if (ops !== null) extras.push(`${formatRate(ops)} OPS`);
  return [parts[0], ...extras].join(', ');
}

/** Sum per-game batting lines into one aggregate line (e.g. across a date range). */
export function combineLines(lines: BattingLine[]): BattingLine {
  const sum = (f: (l: BattingLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  const max = (f: (l: BattingLine) => number | null) => {
    const vals = lines.map(f).filter((v): v is number => v !== null && v > 0);
    return vals.length ? Math.max(...vals) : null;
  };
  const runValues = lines.map((l) => l.runValue).filter((v): v is number => v !== null);
  return {
    pa: sum((l) => l.pa),
    ab: sum((l) => l.ab),
    hits: sum((l) => l.hits),
    singles: sum((l) => l.singles),
    doubles: sum((l) => l.doubles),
    triples: sum((l) => l.triples),
    hr: sum((l) => l.hr),
    bb: sum((l) => l.bb),
    so: sum((l) => l.so),
    hbp: sum((l) => l.hbp),
    sf: sum((l) => l.sf),
    runs: sum((l) => l.runs),
    rbi: sum((l) => l.rbi),
    sb: sum((l) => l.sb),
    cs: sum((l) => l.cs),
    totalBases: sum((l) => l.totalBases),
    hardHits: sum((l) => l.hardHits),
    avgExitVelo: null,
    maxExitVelo: max((l) => l.maxExitVelo),
    maxDistance: max((l) => l.maxDistance),
    runValue: runValues.length ? runValues.reduce((a, b) => a + b, 0) : null,
  };
}

// ---- Pitching helpers ------------------------------------------------------

/** Outs recorded → innings pitched, the baseball way ("17" outs → "5.2"). */
export function formatIp(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

/** Sum per-game pitching lines into one aggregate (for a multi-game card header). */
export function combinePitchingLines(lines: PitchingLine[]): PitchingLine {
  const sum = (f: (l: PitchingLine) => number) => lines.reduce((s, l) => s + f(l), 0);
  return {
    outs: sum((l) => l.outs),
    hits: sum((l) => l.hits),
    runs: sum((l) => l.runs),
    earnedRuns: sum((l) => l.earnedRuns),
    walks: sum((l) => l.walks),
    strikeouts: sum((l) => l.strikeouts),
    hr: sum((l) => l.hr),
    battersFaced: sum((l) => l.battersFaced),
    pitchesThrown: sum((l) => l.pitchesThrown),
    strikes: sum((l) => l.strikes),
    balls: sum((l) => l.balls),
    doubles: sum((l) => l.doubles),
    triples: sum((l) => l.triples),
    hitBatsmen: sum((l) => l.hitBatsmen),
    atBats: sum((l) => l.atBats),
    intentionalWalks: sum((l) => l.intentionalWalks),
    wildPitches: sum((l) => l.wildPitches),
    inheritedRunners: sum((l) => l.inheritedRunners),
    inheritedRunnersScored: sum((l) => l.inheritedRunnersScored),
    wins: sum((l) => l.wins),
    saves: sum((l) => l.saves),
    holds: sum((l) => l.holds),
  };
}

/** ERA over an aggregate line (earned runs × 9 / innings), or "—" with no outs. */
export function eraOf(line: PitchingLine): string {
  if (line.outs === 0) return '—';
  return ((line.earnedRuns * 27) / line.outs).toFixed(2);
}

/** WHIP over an aggregate line ((walks + hits) / innings), or "—" with no outs. */
export function whipOf(line: PitchingLine): string {
  if (line.outs === 0) return '—';
  return (((line.walks + line.hits) * 3) / line.outs).toFixed(2);
}

/**
 * A pitcher's line over the range in view, as the rates the counting line
 * beside it can't give: "2.45 ERA, 1.09 WHIP, 29% K, 7% BB". This is the card
 * header's line now. The season one it replaced (ERA · FIP · WHIP · K/9 · BB/9
 * · HR/9) stated a different span from everything under it — the card is a read
 * on the days in view — and it isn't lost: the details view's Season tab shows
 * it whole, a tap away, with the room to pair each estimator with the number it
 * estimates.
 *
 * K and BB are shares of **batters faced** rather than the season line's per-9
 * rates. A season has innings to spare where a range can be one appearance, and
 * a single inning turns K/9 into 18.0 where a share of the batters he faced
 * reads the same at any sample — and it is already the vocabulary of the card's
 * own Rates strip below.
 */
export function rangePitchingSummary(line: PitchingLine): string {
  const parts = [`${eraOf(line)} ERA`, `${whipOf(line)} WHIP`];
  const share = (n: number, label: string) => {
    if (line.battersFaced > 0)
      parts.push(`${Math.round((n / line.battersFaced) * 100)}% ${label}`);
  };
  share(line.strikeouts, 'K');
  share(line.walks, 'BB');
  // Comma-separated to match the batter card's line (`rangeBattingSummary`).
  return parts.join(', ');
}

/**
 * What a base-running event did for the runner, which is what its color says.
 *
 * Ten kinds is far too many colors, and the distinction the eye actually wants
 * off a feed is not *which* rule sent him down the line but whether he gained,
 * was given, lost or scored:
 *
 * - `take` he took the base himself (a steal) — the live purple the on-base
 *   ring already uses;
 * - `free` he was handed it (a balk, a wild pitch, a passed ball, a pickoff
 *   throw into right field, the defense declining to contest) — `--walk`, the
 *   color of a free base at the plate, which is what this is on the paths;
 * - `out` he was thrown out (caught stealing, picked off) — `--out`, the same
 *   gray an at-bat's out takes;
 * - `run` he scored — `--hit`.
 */
export type BaseEventTone = 'take' | 'free' | 'out' | 'run';

const BASE_EVENT_TONES: Record<BaseEventKind, BaseEventTone> = {
  sb: 'take',
  cs: 'out',
  po: 'out',
  pocs: 'out',
  poe: 'free',
  balk: 'free',
  wp: 'free',
  pb: 'free',
  di: 'free',
  run: 'run',
};

export const baseEventTone = (kind: BaseEventKind): BaseEventTone => BASE_EVENT_TONES[kind];

/**
 * The badge on a base-running feed item, and on the row it takes in a pitcher's
 * inning block.
 *
 * The base rides in the label only for the kinds the base *is* the event —
 * stealing second, being caught at third. For a balk or a wild pitch the badge
 * names the infraction and MLB's own line directly under it says who moved and
 * where to, so carrying it here would be the same fact twice on two adjacent
 * rows. `pocs` and `po` share their wording deliberately: "picked off" is what
 * happened either way, and they name different bases (he is picked off *at*
 * first, or caught out between first and second), so the two never read alike.
 */
export function baseEventLabel(ev: BaseEvent): string {
  switch (ev.kind) {
    case 'run':
      return 'Run Scored';
    case 'sb':
      return ev.base ? `Stole ${ev.base}` : 'Stolen Base';
    case 'cs':
      return ev.base ? `Caught Stealing ${ev.base}` : 'Caught Stealing';
    case 'po':
    case 'pocs':
      return ev.base ? `Picked Off ${ev.base}` : 'Picked Off';
    case 'poe':
      return 'Pickoff Error';
    case 'balk':
      return 'Balk';
    case 'wp':
      return 'Wild Pitch';
    case 'pb':
      return 'Passed Ball';
    case 'di':
      return 'Indifference';
  }
}

/**
 * The score a play or an event left behind, in the game badge's own away–home
 * form. One helper because a feed item states it in one place whichever kind of
 * item it is — an at-bat and a base event both read it off the same pair.
 */
export function scoreLine(
  game: { awayTeam: string; homeTeam: string },
  away: number | null,
  home: number | null,
): string | null {
  if (away === null || home === null) return null;
  return `${game.awayTeam} ${away}–${home} ${game.homeTeam}`;
}

/** The color keyed to a credit (W/L/S/HLD) — the accent on a pitcher's line,
 *  wherever that line is shown (the card, the feed, the game log). */
export function decisionColor(d: PitchingCredit | null): string {
  if (d === 'W') return 'var(--hit)';
  if (d === 'L') return 'var(--strikeout)';
  if (d === 'S') return 'var(--accent)';
  // A hold takes the relief amber the RP chip uses — it's the reliever's credit.
  if (d === 'H') return 'var(--hr)';
  return 'var(--muted)';
}

/**
 * The chip text for a pitching credit. The letters are the scorebook's, except
 * a hold — "H" alone reads as a hit next to a line of them, so it's spelled.
 */
export function creditLabel(credit: PitchingCredit): string {
  return credit === 'H' ? 'HLD' : credit;
}

/** How a game value compares to a reference (season/league avg), for an arrow. */
export interface Delta {
  dir: 'up' | 'down' | 'flat';
  diff: number; // signed magnitude (game − reference)
}

/** Compare a game value to a reference; `flatBand` is the |diff| treated as even. */
export function deltaVs(value: number | null, ref: number | null, flatBand = 0): Delta | null {
  if (value === null || ref === null) return null;
  const diff = value - ref;
  const dir = Math.abs(diff) <= flatBand ? 'flat' : diff > 0 ? 'up' : 'down';
  return { dir, diff };
}

export function fmt(n: number | null, digits = 0, suffix = ''): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(digits)}${suffix}`;
}

/** Baseball Savant's pitch-type color + abbreviation, keyed by the full pitch
 * name the feed reports ("4-Seam Fastball"). Used to color-code the arsenal the
 * way the Savant player page does. Falls back to a neutral gray + 2-letter slug. */
const PITCH_STYLE: Record<string, { abbr: string; color: string }> = {
  '4-Seam Fastball': { abbr: 'FF', color: '#d22d49' },
  Sinker: { abbr: 'SI', color: '#fe9d00' },
  Cutter: { abbr: 'FC', color: '#933f2c' },
  Slider: { abbr: 'SL', color: '#c9b200' },
  Sweeper: { abbr: 'ST', color: '#ddb33a' },
  Slurve: { abbr: 'SV', color: '#93afd4' },
  Curveball: { abbr: 'CU', color: '#00d1ed' },
  'Knuckle Curve': { abbr: 'KC', color: '#6236cd' },
  'Slow Curve': { abbr: 'CS', color: '#7a5fd0' },
  Changeup: { abbr: 'CH', color: '#1dbe3a' },
  Splitter: { abbr: 'FS', color: '#3bacac' },
  Forkball: { abbr: 'FO', color: '#55ccab' },
  Screwball: { abbr: 'SC', color: '#60db33' },
  Knuckleball: { abbr: 'KN', color: '#5b6bb5' },
  Eephus: { abbr: 'EP', color: '#888888' },
};

export function pitchStyle(name: string): { abbr: string; color: string } {
  return PITCH_STYLE[name] ?? { abbr: name.slice(0, 2).toUpperCase(), color: '#8a8f98' };
}

/**
 * A string reduced to unaccented ASCII: NFKD splits every accented letter into
 * its base plus a combining mark, and the marks are then dropped. **The one
 * definition of that in this workspace** — `searchFold` below and
 * `savantPlayerUrl` under it both stand on it, and the server has its own copy
 * in `names.ts` for the reason the two `types.ts` files are mirrored by hand:
 * the workspaces cannot import from each other.
 */
export function stripAccents(raw: string): string {
  return raw.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/**
 * A name reduced to what a typed query and a printed name can be expected to
 * agree on — this is what every search box in the app matches on, so that
 * `garcia` finds García and `García` finds him too. Accents folded away, case
 * dropped, and **every** non-alphanumeric removed rather than collapsed to a
 * space.
 *
 * That last part is what lets one `includes` answer the whole punctuation
 * question at once: `Crow-Armstrong`, `O'Neill`, `J.T. Realmuto` and
 * `Nestor Cortes Jr.` fold to `crowarmstrong`, `oneill`, `jtrealmuto` and
 * `nestorcortesjr`, so `crow armstrong` / `crow-armstrong` / `crowarmstrong`
 * are one query, and so are `o neill` / `o'neill` / `oneill` and `j.t.` / `jt`.
 * It is also why generational suffixes are **kept** where the server's
 * `normalizeName` drops them: that one matches two whole names against each
 * other, where this one matches a fragment *into* one — strip `jr` here and a
 * search for it is a search for nothing.
 *
 * **A fold rather than `localeCompare`.** `Intl.Collator` with
 * `sensitivity: 'base'` is the other way to call `garcia` and `García` equal,
 * and it compares whole strings: there is no collator-aware `includes`, so
 * substring matching with one means sliding a window along every row by hand.
 * A fold gives the same answer through the engine's own `includes`, and — the
 * half that matters on the research board's ~1,400 rows — it can be computed
 * **once per row** and held, where a collator would have to run per row per
 * keystroke.
 */
export function searchFold(raw: string): string {
  return stripAccents(raw).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Slug + id for a Baseball Savant player page link. */
export function savantPlayerUrl(name: string, id: number): string {
  const slug = stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `https://baseballsavant.mlb.com/savant-player/${slug}-${id}?stats=statcast-r-hitting-mlb`;
}

/** MLB headshot for a player id (transparent PNG, ~120px). */
export function headshotUrl(id: number): string {
  return `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`;
}

/**
 * A club's cap logo, by team id — what the research board draws where it used
 * to print the abbreviation.
 *
 * **The `on-dark` variant, deliberately.** MLB publishes each cap mark cut for
 * a light ground and for a dark one, and this app has one palette and it is
 * dark: the light cut is drawn in the club's own navy for half the league, so
 * the Yankees and the Rays would be a smudge on `--panel`. The dark cut is the
 * same mark with its fills lifted (white or the club's bright secondary), which
 * is legible at the 16px a table row can give it. The primary `team-logos/{id}`
 * full logo is the wrong shape as well as the wrong contrast — it is wordmarks
 * and roundels, which do not survive being 16px tall.
 */
export function teamLogoUrl(teamId: number): string {
  return `https://www.mlbstatic.com/team-logos/team-cap-on-dark/${teamId}.svg`;
}

/**
 * **The ground a cap mark is drawn on, in the club's own color.**
 *
 * `teamLogoUrl` above asks MLB for the **`on-dark`** cut, and the note there
 * says why: the light cut is drawn in the club's own navy for half the league,
 * which is a smudge at 15px. What that note also assumed — in as many words —
 * is that "this app has one palette and it is dark", so the page supplied the
 * dark ground the cut needs. It no longer does: **Powder Blue is a light
 * theme**, and thirteen of the thirty marks are drawn in white *alone* (CIN,
 * DET, KC, LAD, WSH, ATH, PHI, ATL, CWS, NYY among them, checked by reading
 * every SVG), so on a powder page they were invisible. The Yankees' is the one
 * that gets reported: a white NY on white.
 *
 * So the mark brings its own ground rather than borrowing the page's, and the
 * ground is the club's — which is also what a cap *is*, so the row gains a
 * picture rather than a patch.
 *
 * **It is a curated table because no upstream publishes one**, which is the same
 * answer `STAT_META` and `pitchLeague.ts` give to the same question. Probed
 * rather than assumed: `statsapi.mlb.com/api/v1/teams/{id}` carries `name`,
 * `abbreviation`, `venue`, `league`, `division` and no color field of any kind,
 * and `hydrate=team(colors)` changes nothing about the response.
 *
 * **Deriving it from the `on-light` cut was tried and gets 24 of 30.** That cut
 * is drawn in the club's own dark colors, so its darkest ink is a fair proxy —
 * NYY yields `#132448`, DET `#0a2240`, KC `#004687`, ATH `#003831`. It breaks on
 * the six clubs whose cap color appears in neither cut (CWS's carries no hex at
 * all, and PIT, SF, BAL, AZ and MIA are drawn in a bright secondary), and a rule
 * that is right four times in five is worse than a table, because nothing on
 * screen would say which five were wrong.
 *
 * **What is mechanical is the check.** Every color in every mark was read out
 * of the thirty SVGs and measured against the ground below, requiring the
 * mark's *best* ink to clear **4.5:1** — the best rather than the worst, because
 * a cap really is red-on-navy in places and the question is whether the mark
 * reads, not whether every part of it does. All thirty pass; the tightest are
 * PHI **4.57** (a white P on Phillies red, which is their cap exactly), SF 4.86
 * and NYM 4.93, and the median is over 10.
 *
 * **Two clubs are not on their primary, and both for the same reason**: the
 * mark contains that primary, so it would have vanished into it. NYM sits on
 * `#00205b`, a shade under their `#002D72`, which takes the orange NY from 4.13
 * to 4.93; STL sits on the navy of their own cap rather than on Cardinal red,
 * which takes the mark from 5.84 to 15.79.
 *
 * A club this table has never seen — a minor-league id, which is what a rehab
 * assignment resolves to — takes a neutral dark, because the *cut* is the thing
 * that needs a dark ground and that is true whoever the club is.
 */
const TEAM_COLOR: Record<number, string> = {
  108: '#ba0021', // LAA
  109: '#000000', // AZ
  110: '#000000', // BAL
  111: '#0c2340', // BOS
  112: '#0e3386', // CHC
  113: '#c6011f', // CIN
  114: '#0c2340', // CLE
  115: '#33006f', // COL
  116: '#0c2340', // DET
  117: '#002d62', // HOU
  118: '#004687', // KC
  119: '#005a9c', // LAD
  120: '#14225a', // WSH
  121: '#00205b', // NYM — a shade under their own blue; see above
  133: '#003831', // ATH
  134: '#27251f', // PIT
  135: '#2f241d', // SD
  136: '#0c2c56', // SEA
  137: '#27251f', // SF
  138: '#0c2340', // STL — the navy of the cap, not Cardinal red; see above
  139: '#092c5c', // TB
  140: '#003278', // TEX
  141: '#134a8e', // TOR
  142: '#002b5c', // MIN
  143: '#e81828', // PHI
  144: '#13274f', // ATL
  145: '#27251f', // CWS
  146: '#000000', // MIA
  147: '#0c2340', // NYY
  158: '#12284b', // MIL
};

/** A neutral dark for a club the table has never seen — see above. */
const TEAM_COLOR_FALLBACK = '#1f2733';

export function teamColor(teamId: number): string {
  return TEAM_COLOR[teamId] ?? TEAM_COLOR_FALLBACK;
}

const PITCH_ABBR: Record<string, string> = {
  '4-Seam Fastball': 'FF',
  Sinker: 'SI',
  Cutter: 'FC',
  Slider: 'SL',
  Sweeper: 'ST',
  Curveball: 'CU',
  'Knuckle Curve': 'KC',
  Changeup: 'CH',
  Splitter: 'FS',
  'Split-Finger': 'FS',
  Slurve: 'SV',
  Screwball: 'SC',
  Forkball: 'FO',
  Eephus: 'EP',
  'Slow Curve': 'CS',
};

export function pitchAbbr(name: string | null): string {
  if (!name) return '?';
  return PITCH_ABBR[name] ?? name.slice(0, 2).toUpperCase();
}

/** Whether a pitch description represents a swing. */
export function isSwing(description: string): boolean {
  return (
    description.includes('swinging') ||
    description === 'hit_into_play' ||
    description.includes('foul')
  );
}

/** Local first-pitch time like "7:05 PM" from an ISO datetime (null if unparseable). */
export function formatStartTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * "Top 7" from the two fields MLB publishes it as. One definition, because two
 * places read it now: this file's own `gameStatusView`, off a `PlayerGame`, and
 * the research board's opponent cell, off a `PlayerStatus` — which carries the
 * same pair rather than a label built on the server, so the board and the
 * summary table cannot come to word a live inning differently. Null when there
 * is no inning to name, which is the caller's cue to fall back.
 */
export function inningLabel(
  inningState: string | null,
  inning: number | null,
): string | null {
  if (inning === null) return null;
  return `${inningState ?? ''} ${inning}`.trim();
}

/** The four things a line score is written out of, away first. */
export interface ScoreSides {
  away: string;
  awayScore: number;
  home: string;
  homeScore: number;
}

export interface GameStatusView {
  kind: 'scheduled' | 'live' | 'final' | 'postponed';
  /** Away-first line score, e.g. "BOS 2–3 NYY" (null before a game starts). */
  score: string | null;
  /**
   * The same score before it was joined into a string, or null where there is
   * none.
   *
   * It was cut out for **one** caller — the summary table's opponent cell, when
   * that cell was to wrap one of the two clubs in a link to its page, which
   * cannot be done to the middle of a finished string. **That door is now the
   * whole line and opens the game's own page instead** (see
   * `SummaryTable.tsx::OpponentCell`, which records why), so what the cell
   * reads off this is the *test*: a null here is a game with no score yet, and
   * that is which of the two shapes it is drawing.
   *
   * Kept in that shape rather than reduced to a boolean, because `score` is
   * built from it and the two therefore cannot come to disagree — which is the
   * property this was extracted for and is worth more than the field costs.
   */
  sides: ScoreSides | null;
  /** Right-hand label: start time, current inning, or "Final". */
  detail: string;
}

/** Presentation of a game's status: start time (scheduled), score + inning (live), or final. */
export function gameStatusView(game: PlayerGame): GameStatusView {
  const s = game.status;
  // **`scoreLine` rather than the same template again**, which is what stood
  // here: this function spelled `${away} ${a}–${h} ${home}` inline while the
  // feed's own helper twenty lines up spelled it identically, so the app had two
  // definitions of a line score that happened to agree. One of them is now the
  // other's caller.
  const score = scoreLine(game, s.awayScore, s.homeScore);
  const sides: ScoreSides | null =
    s.awayScore !== null && s.homeScore !== null
      ? { away: game.awayTeam, awayScore: s.awayScore, home: game.homeTeam, homeScore: s.homeScore }
      : null;

  if (s.state === 'postponed') {
    // A postponed game's start time is often bumped to the makeup date, so show
    // the "Postponed" label rather than a misleading next-day time.
    return { kind: 'postponed', score: null, sides: null, detail: s.detailedState || 'Postponed' };
  }
  if (s.state === 'scheduled') {
    const t = formatStartTime(s.startTime);
    return { kind: 'scheduled', score: null, sides: null, detail: t ?? (s.detailedState || 'Scheduled') };
  }
  if (s.state === 'live') {
    return {
      kind: 'live',
      score,
      sides,
      detail: inningLabel(s.inningState, s.currentInning) ?? (s.detailedState || 'Live'),
    };
  }
  return { kind: 'final', score, sides, detail: 'Final' };
}

/** Short "Jul 3" style date, for disambiguating games across a date range. */
export function prettyGameDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function describePitch(description: string): string {
  return description.replace(/_/g, ' ');
}

/** Pitcher-hand code to a throwing label: "R" → "RHP", "L" → "LHP". */
export function handThrows(hand: string | null): string {
  return hand === 'R' ? 'RHP' : hand === 'L' ? 'LHP' : 'P';
}

const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);

/**
 * "Tarik Skubal" → "Skubal", "Nestor Cortes Jr." → "Cortes Jr." — a starter is
 * referred to by surname anyway, and every place one is named beside a matchup
 * (the summary table's opponent cell, the feed's Upcoming bar) is a row where a
 * wider name costs something else off the right of a phone screen.
 */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1];
  return NAME_SUFFIXES.has(last.toLowerCase()) && parts.length > 2
    ? `${parts[parts.length - 2]} ${last}`
    : last;
}

/**
 * True when a watched player never came to the plate: either their team didn't
 * play (no games) or they were rostered for a completed game but didn't bat. A
 * player with a still-pending game (scheduled/live) hasn't "not appeared" yet.
 */
export function didNotAppear(report: PlayerReport): boolean {
  if (!report.found || report.games.length === 0) return true;
  return !report.games.some(
    (g) => g.plateAppearances.length > 0 || g.pitching || g.status.state !== 'final',
  );
}

/**
 * True once a player has actually batted — at least one plate appearance in
 * some game. This is what counts as "played": being rostered or in the lineup
 * for a scheduled/in-progress game doesn't count until they come to the plate.
 */
export function hasPlayed(report: PlayerReport): boolean {
  return report.games.some((g) => g.plateAppearances.length > 0 || g.pitching);
}

/**
 * Sort comparator putting a player's most recent game first: by date, then game
 * number within a day (so a doubleheader's game 2 leads game 1), with gamePk as
 * a last-resort tiebreak. gamePk alone is NOT reliable — a doubleheader's game 2
 * can carry a lower gamePk than game 1 — so gameNumber decides. gameNumber is
 * null only for older cached games, where it falls back to gamePk.
 */
export function mostRecentGameFirst(a: PlayerGame, b: PlayerGame): number {
  return (
    b.date.localeCompare(a.date) ||
    (b.gameNumber ?? 0) - (a.gameNumber ?? 0) ||
    b.gamePk - a.gamePk
  );
}

/** An integer as an English ordinal: 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix =
    rem100 >= 11 && rem100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

/**
 * The lineup indicator for a game. For a starter it's just their batting-order
 * number (with "Batting Nth" as the hover title); "Not in lineup" when the
 * lineup is out but they're not in it. Null when the lineup hasn't posted.
 */
export function lineupBadge(
  game: PlayerGame,
): { label: string; title: string; tone: 'in' | 'out' } | null {
  if (game.lineupStatus === 'starting') {
    return game.lineupSpot
      ? { label: String(game.lineupSpot), title: `Batting ${ordinal(game.lineupSpot)}`, tone: 'in' }
      : { label: 'Starting', title: 'Starting', tone: 'in' };
  }
  if (game.lineupStatus === 'bench') {
    return { label: 'Not in lineup', title: 'Not in lineup', tone: 'out' };
  }
  return null;
}

/**
 * The pip pinned to a headshot corner — a batting slot, a pitching role, or a
 * flag for a game the player is out of. Shared by the cards and the summary
 * table so the two read identically.
 */
export type CornerTone = 'in' | 'out' | 'postponed' | 'start' | 'relief';
export type Corner = { text: string; title: string; tone: CornerTone } | null;

/**
 * The five facts a corner pip is drawn from, named apart from the game they
 * usually arrive on.
 *
 * A watchlist view has a whole `PlayerGame` to read them off; the research
 * board and the details view have a `PlayerStatus`, which is these five and
 * nothing else precisely because they are all a pip needs. Pulling them out
 * keeps one definition of what "batting 3rd" and "SP" look like rather than a
 * second, drifting copy for the views with no report behind them.
 */
export interface CornerFacts {
  state: GameStatus['state'] | null;
  lineupStatus: 'starting' | 'bench' | null;
  lineupSpot: number | null;
  pitchingRole: 'starting' | 'relief' | null;
  entryInning: number | null;
}

function factsOfGame(game: PlayerGame): CornerFacts {
  return {
    state: game.status.state,
    lineupStatus: game.lineupStatus,
    lineupSpot: game.lineupSpot,
    pitchingRole: game.pitchingRole,
    entryInning: game.entryInning,
  };
}

/**
 * Corner badge for a player headshot: the batting-order number when the player is
 * in the lineup, an exclamation mark when a posted lineup left them out or the
 * game was postponed. Null when the lineup hasn't posted (or a starter has no
 * known spot) — nothing to show.
 */
export function battingCorner(f: CornerFacts): Corner {
  if (f.state === 'postponed') {
    return { text: '!', title: 'Postponed', tone: 'postponed' };
  }
  if (f.lineupStatus === 'bench') {
    return { text: '!', title: 'Not in lineup', tone: 'out' };
  }
  if (f.lineupStatus === 'starting' && f.lineupSpot) {
    return { text: String(f.lineupSpot), title: `Batting ${ordinal(f.lineupSpot)}`, tone: 'in' };
  }
  return null;
}

export function lineupCorner(game: PlayerGame): Corner {
  return battingCorner(factsOfGame(game));
}

/**
 * The pitching-role indicator for a game — the pitcher-side mirror of
 * lineupBadge. "SP" for the starter (announced before first pitch, confirmed by
 * the boxscore after), "RP 7th" for a reliever, naming the inning he came in.
 * Null when he hasn't pitched and isn't the posted probable.
 */
export function pitchingRoleBadge(
  f: CornerFacts,
): { label: string; title: string; tone: 'start' | 'relief' } | null {
  if (f.pitchingRole === 'starting') {
    return {
      label: 'SP',
      title: f.state === 'scheduled' ? 'Probable starting pitcher' : 'Started the game',
      tone: 'start',
    };
  }
  if (f.pitchingRole === 'relief') {
    return f.entryInning
      ? {
          label: `RP ${ordinal(f.entryInning)}`,
          title: `Relieved in the ${ordinal(f.entryInning)}`,
          tone: 'relief',
        }
      : { label: 'RP', title: 'Relief appearance', tone: 'relief' };
  }
  return null;
}

export function pitchingBadge(
  game: PlayerGame,
): { label: string; title: string; tone: 'start' | 'relief' } | null {
  return pitchingRoleBadge(factsOfGame(game));
}

/**
 * Corner badge for a pitcher headshot, the counterpart of battingCorner: "SP"
 * for a starter, the entry inning for a reliever (a bare number, like a batting
 * slot — the title spells it out), or an exclamation mark for a postponed game.
 */
export function pitcherCorner(f: CornerFacts): Corner {
  if (f.state === 'postponed') {
    return { text: '!', title: 'Postponed', tone: 'postponed' };
  }
  const badge = pitchingRoleBadge(f);
  if (!badge) return null;
  return {
    text: f.pitchingRole === 'relief' && f.entryInning ? String(f.entryInning) : 'SP',
    title: badge.title,
    tone: badge.tone,
  };
}

export function pitchingCorner(game: PlayerGame): Corner {
  return pitcherCorner(factsOfGame(game));
}

/**
 * The corner pip for a player with no report behind him — the research board
 * and the details view, which know a `PlayerStatus` and nothing else about his
 * day. Reads exactly as the watchlist's does, because it is the same two
 * functions: a batting slot for a hitter, "SP" or an entry inning for a
 * pitcher, "!" for a postponement or a lineup that left him out.
 */
export function statusCorner(status: PlayerStatus, kind: PlayerKind): Corner {
  const facts: CornerFacts = {
    state: status.gameState,
    lineupStatus: status.lineupStatus,
    lineupSpot: status.lineupSpot,
    pitchingRole: status.pitchingRole,
    entryInning: status.entryInning,
  };
  return kind === 'pitcher' ? pitcherCorner(facts) : battingCorner(facts);
}

/**
 * Is this player starting on `date` — in the posted lineup if he's a hitter,
 * the announced (or actual) starting pitcher if he isn't.
 *
 * The summary table's one filter reads this — on the saved roster, where the
 * question it asks is about tonight's lineup card. Reading a fantasy team it
 * asks a different question and reads the fantasy lineup instead, which is
 * argued where the filtering happens (`App.tsx::summaryReports`).
 *
 * It is deliberately drawn from the
 * player's own `PlayerGame` rather than from the league-wide `/api/statuses`
 * map: the summary is a read on the watchlist, so every row already carries the
 * report the pip on its headshot is drawn from, and a row marked "2" is exactly
 * a row this keeps. The board and the details view fetch that map because they
 * have *no* report — asking a hundred kilobytes of the whole league for the
 * twenty players already in hand would be a second source that could disagree
 * with the pip beside it.
 *
 * Reading a game rather than a report is what makes the date explicit, and it
 * has to be: a report spans the range in view, and "starting" said of a game
 * four days ago is a fact about a night that has already happened. A
 * doubleheader passes on either game — `some`, not the first one found.
 *
 * A postponed game is not a start. The lineup for one is posted and then means
 * nothing, which is exactly what the "!" pip on the headshot says.
 */
export function isStartingOn(report: PlayerReport, date: string): boolean {
  return report.games.some((g) => {
    if (g.date !== date || g.status.state === 'postponed') return false;
    return report.kind === 'pitcher'
      ? g.pitchingRole === 'starting'
      : g.lineupStatus === 'starting';
  });
}

/**
 * Label for a player with no batting to show. "No game" when their team wasn't
 * scheduled that day (no game to tie them to at all — getReport gives a rostered
 * player a placeholder for any game their team plays, so zero games means none
 * happened). When a game did happen: "Not in lineup" if a posted lineup left
 * them out (benched), otherwise the plain "Did not appear".
 */
export function absenceLabel(report: PlayerReport): string {
  if (report.games.length === 0) return 'No game';
  if (report.kind === 'pitcher') return 'Did not pitch';
  return report.games.some((g) => g.lineupStatus === 'bench')
    ? 'Not in lineup'
    : 'Did not appear';
}

/**
 * True when the player's team plays two (or more) games on a single date — a
 * doubleheader. Counts per date so a multi-day range with one game each day
 * doesn't read as a doubleheader.
 */
export function hasDoubleheader(games: PlayerGame[]): boolean {
  const byDate = new Map<string, number>();
  for (const g of games) byDate.set(g.date, (byDate.get(g.date) ?? 0) + 1);
  return [...byDate.values()].some((n) => n >= 2);
}

/** A watched player's current live role, for highlighting them in the UI. */
export type LiveRole = 'at-bat' | 'on-deck' | 'on-base' | 'pitching';

/**
 * The player's current live role: a watched pitcher on the mound ('pitching'),
 * else a batter at bat / on deck / on base (checked in that priority order).
 * Null otherwise.
 */
export function liveRole(report: PlayerReport): LiveRole | null {
  return liveRoleGame(report)?.role ?? null;
}

/**
 * Short label for a live role — the live tag on a feed row and a player card,
 * and the four entries in the summary table's legend.
 *
 * **`pitching` reads `On mound` and used to read `Pitching`.** The four are one
 * vocabulary and were three prepositional phrases and a verb: at bat, on deck,
 * on base, and then *Pitching*, which is the only one that says what he is
 * doing rather than where he is. That was invisible while nothing put the four
 * in a row — the tag is drawn one at a time, and the batter and pitcher tabs
 * never share a table — and it stopped being invisible the moment the legend
 * gave them a shared home.
 *
 * It costs the live tag **8.09px** (measured on a real feed row: the pill goes
 * 78.05 → 86.14), which is the one place the string is drawn inside a laid-out
 * row rather than in a legend that wraps; the tag sits in a feed item's header
 * beside a name and a matchup with room to spare, and no width in the app moved
 * as a result (checked at 390 and 1200, page overflow 0 at both).
 */
export function liveRoleLabel(role: LiveRole): string {
  return role === 'at-bat'
    ? 'At bat'
    : role === 'on-deck'
      ? 'On deck'
      : role === 'on-base'
        ? 'On base'
        : 'On mound';
}

/**
 * The player's current live role together with the live game it's happening in.
 * A pitcher is 'pitching' while he is still **in** the game; a batter is at bat
 * → on deck → on base. Used by the live feed's "Live" section.
 *
 * `inGamePitcherIds` rather than `pitchingId` is what "still pitching" means
 * here. `pitchingId` is the man on the mound in *this* half, which is nobody on
 * the resting side — so a starter dropped out of the Live section the moment his
 * own team came up to bat, and climbed back in an inning later, all game. He is
 * pitching until he is taken out, and the section should say so without
 * flickering; a pitcher who *has* been replaced falls out of it for good, which
 * is the half of the old behavior that was right.
 */
export function liveRoleGame(
  report: PlayerReport,
): { role: LiveRole; game: PlayerGame } | null {
  for (const g of report.games) {
    if (g.status.state !== 'live') continue;
    if (report.kind === 'pitcher') {
      if (g.status.inGamePitcherIds.includes(report.id)) return { role: 'pitching', game: g };
      continue;
    }
    if (g.status.atBatId === report.id) return { role: 'at-bat', game: g };
    if (g.status.onDeckId === report.id) return { role: 'on-deck', game: g };
    if (g.status.onBaseIds.includes(report.id)) return { role: 'on-base', game: g };
  }
  return null;
}

/**
 * A single recency value (epoch ms) for an at-bat: the real per-play `timestamp`
 * when present (live and modern cached games carry it), else the game's day as a
 * stand-in so undated at-bats from older cached feeds still land on the right
 * date. Returning ONE value per at-bat — rather than switching keys per pair —
 * is what keeps the comparator a consistent total order.
 */
function atBatRecency(entry: { game: PlayerGame; pa: PlateAppearance }): number {
  if (entry.pa.timestamp) {
    const t = Date.parse(entry.pa.timestamp);
    if (!Number.isNaN(t)) return t;
  }
  // No per-play time: fall back to the end of the game's date, so it sorts onto
  // the correct day; within the day gameNumber/atBatNumber break the tie.
  const d = Date.parse(`${entry.game.date}T23:59:59Z`);
  return Number.isNaN(d) ? 0 : d;
}

/**
 * Comparator putting the most recent at-bat first, across every watched player's
 * games. Sorts by a single recency key (see `atBatRecency`) so it stays a valid
 * total order even when some at-bats have a timestamp and others don't — mixing
 * a timestamp comparison for some pairs with a game-order comparison for others
 * (the previous approach) is non-transitive and scrambles the whole list.
 */
export function mostRecentAtBatFirst(
  a: { game: PlayerGame; pa: PlateAppearance },
  b: { game: PlayerGame; pa: PlateAppearance },
): number {
  return (
    atBatRecency(b) - atBatRecency(a) ||
    (b.game.gameNumber ?? 0) - (a.game.gameNumber ?? 0) ||
    b.pa.atBatNumber - a.pa.atBatNumber ||
    // Final tiebreaker so undated at-bats (older cached games with no timestamp)
    // from different games on the same day still order deterministically.
    b.game.gamePk - a.game.gamePk
  );
}

/** Human description of a base state, for a diamond's aria-label/tooltip. */
export function basesLabel(b: BaseState): string {
  if (b.first && b.second && b.third) return 'Bases loaded';
  const on = [b.first && '1st', b.second && '2nd', b.third && '3rd'].filter(Boolean);
  if (on.length === 0) return 'Bases empty';
  return `Runner${on.length > 1 ? 's' : ''} on ${on.join(' and ')}`;
}

/**
 * A batter's line over the range in view: "4 G · .313/.389/.625". The card
 * header's line now, in place of the season one (".722 OPS, 11 HR, 30 RBI, 35
 * R, 1 SB"), which stated a different span from everything under it; the season
 * reads whole on the details view's Season tab, a tap away.
 *
 * The slash rather than the counting stats, because the counting line sits in
 * the same header a few centimetres to the right (`lineSummary` — "5-16, 3 R, 2
 * HR, 5 RBI") and the two halves of a slash line are the one thing it cannot
 * say. Its own OPS is left out for that same reason: the line beside it already
 * ends in one, and this is that number's two halves.
 */
export function rangeBattingSummary(line: BattingLine, games: number): string {
  const g = `${games} G`;
  // A range of nothing but walks has no at-bat to divide by, and the plate
  // appearances are then the whole of what happened.
  if (line.ab === 0) return `${g} · ${line.pa} PA`;
  // The OBP denominator is lineOps's, sacrifice fly and all — one definition of
  // that denominator, so the slash line printed here and the OPS printed beside
  // it cannot come to disagree about a fly ball.
  const obpDen = line.ab + line.bb + line.hbp + line.sf;
  const obp = obpDen ? (line.hits + line.bb + line.hbp) / obpDen : 0;
  return `${g} · ${formatRate(line.hits / line.ab)}/${formatRate(obp)}/${formatRate(
    line.totalBases / line.ab,
  )}`;
}

export type RosterTone = 'il' | 'susp' | 'dtd' | 'minors' | 'other';

/**
 * Whether the player is on the active roster and can appear in a game today.
 * Anything that earns a status badge — an IL stint, a suspension, an option to
 * the minors, paternity leave — means he isn't, so nothing about him belongs in
 * a list of what's still to come.
 */
export function isOnActiveRoster(status: RosterStatus | null): boolean {
  return rosterStatusBadge(status) === null;
}

/**
 * Whether a pitcher works out of the rotation — a majority of his appearances
 * this season are starts. A starter takes the ball every fifth day, so his
 * team's other games are somebody else's; a reliever's could be any of them,
 * which is why the distinction is worth drawing at all. Nobody with no
 * appearances yet counts (a season-opening rotation is a guess from here).
 */
export function isRotationStarter(report: PlayerReport): boolean {
  const s = report.pitcherSeasonStats;
  if (!s || s.gamesPlayed === 0) return false;
  return s.gamesStarted * 2 >= s.gamesPlayed;
}

/**
 * A short card badge for a roster status that keeps a player off the field —
 * an IL stint, suspension, or option to the minors. Returns null when the
 * player is active (or status is unknown), since an active player needs no
 * badge. `tone` drives the badge color; `title` is the API's full description.
 */
/**
 * Short codes for the statuses that have no natural abbreviation, keyed by
 * MLB's own status code. The badge on a headshot has about four characters of
 * room, so "Designated for Assignment" has to become something, and the
 * something is worth writing down once rather than deriving: initials give
 * `DFA` here but `RA` for "Rehab Assignment" only by luck, and `MLC` for
 * "Minor League Contract" where the useful word is that he is in the minors.
 */
const SHORT_BY_CODE: Record<string, string> = {
  RA: 'RA', // Rehab assignment — an IL stint with minor-league games attached.
  SU: 'SUS',
  RM: 'MIN',
  MIN: 'MIN', // "Minor League Contract" — the same fact as RM for our purposes.
  TR: 'TR',
  RL: 'REL',
  CL: 'CL',
  DES: 'DFA',
  FA: 'FA',
  RES: 'RES',
  BRV: 'BRV',
  PL: 'PAT',
  NRI: 'NRI',
};

/** Last resort for a code the table above hasn't got: the code itself if it is
 *  already badge-sized, else the description's initials (so an unmapped
 *  "Temporarily Inactive" reads `TI` rather than being blank or overflowing). */
function fallbackShort(code: string, description: string): string {
  if (code && code.length <= 4) return code.toUpperCase();
  const initials = description
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase())
    .join('');
  return initials.slice(0, 4) || '•';
}

export function rosterStatusBadge(
  status: RosterStatus | null,
): { label: string; short: string; title: string; tone: RosterTone } | null {
  if (!status) return null;
  const { code, description } = status;
  // Active (and the on-roster non-states) need no badge.
  if (code === 'A' || code === 'RM0' || description === 'Active') return null;
  // Injured 10/15/60-Day → "IL" with the day count when the label carries one.
  if (/^D\d/.test(code) || description.startsWith('Injured')) {
    const days = description.match(/(\d+)-Day/)?.[1];
    return {
      label: days ? `${days}-day IL` : 'IL',
      // `IL10` rather than `10-day IL`: on a headshot the number is what
      // distinguishes one stint from another, and the word is what doesn't fit.
      short: days ? `IL${days}` : 'IL',
      title: description,
      tone: 'il',
    };
  }
  if (code === 'SU' || description.startsWith('Suspended')) {
    return { label: 'Suspended', short: 'SUS', title: description, tone: 'susp' };
  }
  if (code === 'RM' || description.includes('Minors')) {
    return { label: 'Minors', short: 'MIN', title: description, tone: 'minors' };
  }
  // Anything else (DFA, restricted, paternity, not-yet-reported, ...) shows the
  // API's own description, trimmed of the "# days" placeholder some carry.
  return {
    label: description.replace(/\s*#\s*days?$/i, ''),
    short: SHORT_BY_CODE[code] ?? fallbackShort(code, description),
    title: description,
    tone: 'other',
  };
}

/**
 * Whether the player is on the injured list. The summary table and the players
 * view both offer to drop these rows (the settings menu's "Hide injured"), and
 * neither does so unasked — a line of dashes beside the badge is a fair answer
 * to "is he playing?", and hiding him says nothing at all. Narrower than
 * "has a status badge at all", on purpose: a suspension or an option to the
 * minors is a few days and can end with a recall mid-day, an IL stint is weeks
 * — only the latter is worth a standing filter.
 */
export function isInjured(status: RosterStatus | null): boolean {
  if (!status) return false;
  // A rehab assignment is an IL stint with minor-league games attached: he's
  // still on the IL and still can't turn up in a box score. Its code ('RA')
  // isn't a D-code, so the badge files it under "other" — but for the purpose
  // of hiding a player who won't play, it's the same thing.
  if (status.code === 'RA' || /rehab/i.test(status.description)) return true;
  return rosterStatusBadge(status)?.tone === 'il';
}

/**
 * ESPN's injury designation as a badge, the counterpart to `rosterStatusBadge`
 * for the one thing MLB's roster status cannot say.
 *
 * **Day-to-day and out exist nowhere else in the app.** MLB publishes a roster
 * status, and a day-to-day player is still on the active roster — checked
 * league-wide, its vocabulary is `Active`, the 10/15/60-day IL stints, minors,
 * traded, released, claimed, DFA, free agent and suspended, and nothing in it
 * marks a man who is playing hurt or sitting tonight. ESPN's league roster
 * carries both, so they arrive with the fantasy slot and share its limits: a
 * connected league, and the views reading that roster.
 *
 * The IL codes are here for completeness rather than for display — where ESPN
 * says `TEN_DAY_DL`, MLB has already said `10-day IL`, which is the better
 * label of the two because it is the one the rest of the app uses. The summary
 * table shows this only where MLB's own badge is absent, so the two never state
 * one absence twice.
 */
export function espnInjuryBadge(
  status: string | null | undefined,
): { label: string; short: string; title: string; tone: RosterTone } | null {
  if (!status || status === 'ACTIVE') return null;
  if (status === 'DAY_TO_DAY') {
    return { label: 'DTD', short: 'DTD', title: 'Day-to-day (ESPN)', tone: 'dtd' };
  }
  if (status === 'OUT') {
    return { label: 'OUT', short: 'OUT', title: 'Out (ESPN)', tone: 'il' };
  }
  // TEN_DAY_DL -> "10-day IL", matching what MLB's own badge would have said.
  const dl = status.match(/^(SEVEN|TEN|FIFTEEN|SIXTY)_DAY_DL$/);
  if (dl) {
    const days = { SEVEN: 7, TEN: 10, FIFTEEN: 15, SIXTY: 60 }[dl[1] as
      'SEVEN' | 'TEN' | 'FIFTEEN' | 'SIXTY'];
    return {
      label: `${days}-day IL`,
      short: `IL${days}`,
      title: `${days}-day IL (ESPN)`,
      tone: 'il',
    };
  }
  if (status === 'SUSPENSION') {
    return { label: 'Suspended', short: 'SUS', title: 'Suspended (ESPN)', tone: 'susp' };
  }
  // Anything ESPN adds later reads as itself — "NON_ROSTER" -> "Non roster",
  // short `NR` — rather than vanishing, which is the safe direction to fail in.
  const label = status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const short = status.split('_').map((w) => w[0]).join('').slice(0, 4);
  return { label, short, title: `${label} (ESPN)`, tone: 'other' };
}

/** Exit velo · launch angle · distance for a batted ball, if any was tracked.
 * Takes the batted-ball fields rather than a whole plate appearance, so the
 * pitcher's side reads the same line off a `FacedBatter` — the two carry the
 * same three fields and should say the same thing about the same contact. */
export function contactHighlight(
  hit: Pick<PlateAppearance, 'launchSpeed' | 'launchAngle' | 'hitDistance'>,
): string | null {
  if (hit.launchSpeed === null) return null;
  const bits: string[] = [`${hit.launchSpeed.toFixed(1)} mph`];
  if (hit.launchAngle !== null) bits.push(`${hit.launchAngle}°`);
  if (hit.hitDistance !== null && hit.hitDistance > 0) bits.push(`${hit.hitDistance} ft`);
  return bits.join(' · ');
}

/** Bat speed on the PA's final, decisive swing (if tracked), for a one-line summary. */
export function finalSwingBatSpeed(pa: PlateAppearance): number | null {
  const last = pa.pitches[pa.pitches.length - 1];
  if (!last || !isSwing(last.description) || last.batSpeed === null) return null;
  return last.batSpeed;
}

/**
 * **The baseball day an instant falls in**, as `YYYY-MM-DD`.
 *
 * Both halves of that are the app's own rule rather than the machine's. MLB's
 * days are anchored to US Eastern, so an evening user on the west coast gets an
 * off-by-one from a local or a UTC date — and a baseball day does not end at
 * midnight either: a 10pm ET first pitch out west finishes around 1am, so at
 * 12:30am the day this should name is still the one whose games are ending.
 * The day turns at **3am ET**: later than any game realiztically runs, earlier
 * than anything the next day starts. `server/src/etDate.ts` mirrors the pair
 * (the two workspaces cannot share code, and the API's default date has to land
 * where the client's presets do) — change both.
 *
 * It lives here rather than in `App.tsx`, which held it for as long as it was
 * the only caller: the matchup page needs the day an ESPN transaction happened
 * on to say which week it belongs to, and a second copy of a rule this precise
 * is a second copy that will one day differ from the first.
 */
export const DAY_ROLLOVER_HOUR = 3;

const ET_ZONE = 'America/New_York';
const ET_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Eastern calendar date of an instant, midnight to midnight. */
export function easternDate(d: Date): string {
  const parts = ET_DAY.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The **baseball** day of an instant — the Eastern date of a clock set back to
 *  the rollover hour, so the small hours still belong to the night before. */
export function baseballDay(ms: number): string {
  return easternDate(new Date(ms - DAY_ROLLOVER_HOUR * 3_600_000));
}

/** The dates of an inclusive range, ascending. Cheap — `MAX_RANGE_DAYS` is 62
 *  — and it is what the `Starters` projection and the count on a slot chip both
 *  walk, so it is written once rather than in each of them. */
export function rangeDatesOf(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** `YYYY-MM-DD` plus (or minus) whole days, in UTC so no DST boundary can round
 *  a date the wrong way — the rule `etDate.ts::daysBetween` follows on the
 *  server for the same reason. Exported because three surfaces now move a range
 *  by a day: the app's own date presets, the roster view's projected lens, and a
 *  matchup team page's copy of it. */
export function addDays(date: string, delta: number): string {
  const [y, m, day] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/**
 * **Which of a player's kinds a fantasy seat is a fact about** — the client's
 * half of `espn.ts::seatKinds`, and the same three slot ids.
 *
 * A one-kind player is himself whatever seat he is in; a **two-way player is
 * two rows under one id** and ESPN seats him once, so the slot decides which of
 * the two that afternoon belongs to. Seated at `UTIL` he is a batter you
 * started and a pitcher you did not.
 *
 * Mirrored rather than imported for the reason `types.ts` is mirrored — the
 * workspaces cannot import from each other. The server answers this per *day*,
 * off each day's own roster; this is the end-of-range roster's answer, which is
 * what the slot chip and the `startedOn` fallback are drawn from.
 */
const PITCHING_SLOT_IDS = new Set([13, 14, 15]);

export function seatKinds(kinds: PlayerKind[], slotId: number): PlayerKind[] {
  if (kinds.length < 2) return kinds;
  return [PITCHING_SLOT_IDS.has(slotId) ? 'pitcher' : 'batter'];
}

/**
 * Was this player in a fantasy lineup on `date`?
 *
 * The one place that question is answered, so the filter that credits a
 * player's day and the count on his slot chip cannot come to disagree. A date
 * the map has no entry for is a day the server couldn't read, not a day nobody
 * started: it falls back to `fallback`, the single end-of-range lineup the
 * chips are drawn from, which is the answer the app gave before per-day lineups
 * existed and the right direction to fail in.
 *
 * **It asks by player key rather than by MLB id**, which is what makes it able
 * to answer for a two-way player at all: the app's rows are `${kind}-${id}` and
 * an id names only the man. The map arrives keyed the same way (see
 * `EspnRoster.lineups`), so this is a lookup on the key the caller already
 * holds instead of on a number it had to dig out of the row.
 */
export function startedOn(
  lineups: Map<string, Set<string>>,
  date: string,
  key: string,
  fallback: boolean,
): boolean {
  const day = lineups.get(date);
  return day ? day.has(key) : fallback;
}

/**
 * **The `Starters` filter, and it cuts days rather than only rows.**
 *
 * A range is a range of lineups, so a man started on Monday and benched on
 * Wednesday earned Monday's line and none of Wednesday's: each report is
 * *projected* onto the days he was actually in the lineup, and a player with no
 * such day is dropped outright. Nothing downstream has to be told — the summary
 * table's rows, its `Total` and every feed item all sum `report.games`, so
 * cutting the games is the whole of the change.
 *
 * **A player kept with no games left is not the same as one dropped.** He was
 * in the lineup on some day of the range and simply had no game to play, which
 * is a row of dashes and the honest answer; dropped means he was in it on none
 * of them.
 *
 * Two tiers, and which applies is whether there is a per-day map at all.
 * Without one — an older server, or a per-day read that failed — the single
 * end-of-range answer stands and the filter keeps or drops a whole row, which
 * is what the app did before per-day lineups existed.
 *
 * `starting` is that end-of-range answer, and it is a callback because the two
 * callers reach it differently: the app's own roster reads it off the slot map
 * it is already holding, and a matchup's team page off the roster it read for
 * its chips. It is also the per-day map's own fallback for a day the server
 * could not answer for — see `startedOn`.
 *
 * **It asks by player key, which is what a two-way player made the difference
 * between.** It used to ask by `r.id`, and an id cannot tell a batting row from
 * a pitching one: Ohtani's single `UTIL` seat answered *started* for both of
 * his rows, so his pitching row stood above the pitching table's `Lineup`
 * divider on an afternoon he was seated as a hitter. Both tiers move together —
 * the per-day map is keyed by key now, and `starting` was always handed the
 * report and so could always have looked at its kind.
 */
export function projectStarters(
  cards: PlayerReport[],
  dates: string[],
  lineups: Map<string, Set<string>> | null,
  starting: (r: PlayerReport) => boolean,
): PlayerReport[] {
  if (!lineups) return cards.filter(starting);
  const out: PlayerReport[] = [];
  for (const r of cards) {
    const fallback = starting(r);
    const key = playerKey(r);
    const days = new Set(dates.filter((d) => startedOn(lineups, d, key, fallback)));
    if (days.size === 0) continue;
    const games = r.games.filter((g) => days.has(g.date));
    // Identity is preserved where nothing was cut, so a consumer that memoizes
    // on a report object is not handed a new one for no reason.
    out.push(games.length === r.games.length ? r : { ...r, games });
  }
  return out;
}

/**
 * An ISO day as `Aug 12`, read as the calendar day it is rather than as an
 * instant — `new Date('2026-08-12')` is UTC midnight, which in ET is the 11th,
 * so the parts are taken apart and rebuilt in UTC and printed in UTC.
 *
 * In `lib.ts` because four surfaces print a span of days this way now — the
 * League page's period header, its Rankings caption, a matchup's own head and
 * the Roster view's projection note — and one of them is not a league page at
 * all. It was the League view's export until the fourth caller arrived.
 */
export function prettyDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The same day with its weekday — `Wed, Aug 19`. Only ever reached through
 *  `wideRange`, a span of one day being the only place the weekday is worth
 *  the characters. Same UTC rebuild as `prettyDate`, for the same reason. */
function prettyWeekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * **A span of days, in the app's one wording** — `Wed, Aug 19` for a single day
 * and `Aug 10 – Aug 19` across a range, which is what the date bar's lower line
 * prints and now what every head that states a span prints beside it.
 *
 * It was two functions and they agreed on three of the four cases, which is the
 * shape of a thing that will one day disagree. `wideRange` lived in
 * `DateRangePicker.tsx` and the League's three heads each open-coded
 * `start === end ? prettyDate(start) : prettyDate(start) + ' – ' + prettyDate(end)`.
 * Evaluated side by side in the browser, the only span they parted on was a
 * one-day one — the roster's date face said **`Wed, Aug 19`** where a matchup's
 * head said **`Aug 19`** — and a range inside a month (`Aug 10 – Aug 19`),
 * across a month (`Aug 24 – Sep 6`) and across a year end (`Dec 28 – Jan 3`)
 * came out character for character the same from both. So the fold changes one
 * reading and settles three.
 *
 * **The weekday only on a single day**, which is where it is worth something: a
 * manager reading one day wants to know it is a Wednesday, and a range already
 * says its length in its two ends. The year stays off both — the app shows one
 * season and says so nowhere else on the page.
 *
 * Here rather than in `DateRangePicker.tsx` because that file is deliberately
 * self-contained for the *picker*, and this is now read by the date bar, a
 * matchup's head, the Scoreboard's head and the Rankings caption — none of
 * which opens a calendar. `prettyDate` was already in `lib.ts` for exactly that
 * argument, one caller earlier.
 */
export function wideRange(start: string, end: string): string {
  return start === end ? prettyWeekday(start) : `${prettyDate(start)} – ${prettyDate(end)}`;
}

/**
 * How often the League page re-reads what it is showing, while it is showing
 * it.
 *
 * In `lib.ts` because two files set a timer by it now — App's own league tick
 * and the matchup page's projection, which has to move on the same minute the
 * board under it does or the two halves of a projected card come from different
 * ones.
 *
 * The three tabs are the one part of this app that describes a thing which
 * moves while you watch it — a matchup's category totals climb through an
 * evening's games, the standings under them climb with them, and a leaguemate
 * can drop somebody at any hour — and until now all three were read on entry
 * and then left, so a page anybody actually sits on quietly went stale.
 *
 * A minute rather than the report's twenty seconds, and the reason is what is
 * being watched. That poll tracks a *plate appearance* — bases, count, the
 * batter at the plate — where this tracks a **week's** totals, which ESPN's own
 * scoreboard does not move faster than about a minute anyway. It is matched to
 * `espn.ts::LIVE_TTL_MS` so that a tick either reads a cache under a minute old
 * or goes and asks, which is the cheapest way to be a minute behind ESPN and no
 * more.
 *
 * **A tick is skipped while the tab is hidden**, which is where this parts from
 * the report poll deliberately: a league read is 10–120KB upstream against a
 * league that has no idea we are doing it, and a forgotten background tab
 * polling it all night buys nobody anything. Coming back to the tab polls
 * immediately rather than waiting out the interval, so what a reader returns to
 * is current — which is also what keeps the Transactions dot honest.
 */
export const LEAGUE_POLL_MS = 60_000;

/**
 * **How often the roster re-reads itself while a game is being played** — the
 * poll `App.tsx` runs whenever any row's game is live, and the floor on how
 * stale a page the app is willing to consider current.
 *
 * Twenty seconds against the league poll's minute for the reason stated above
 * it: this one tracks a *plate appearance*, which is the fastest-moving thing
 * the app draws. It was a literal in `App.tsx` until a second reader wanted it
 * — `useResumed`, which asks how long the app was away before deciding a return
 * is worth re-reading anything for, and whose honest answer is "longer than the
 * page would have gone without a re-read had nobody left". A number that means
 * *the app considers itself current for this long* cannot be two numbers.
 */
export const LIVE_POLL_MS = 20_000;
