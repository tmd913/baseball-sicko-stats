import type { ReactNode } from 'react';
import { addDays, handThrows, surname } from '../lib';
import type { Column } from './researchColumns';
import type {
  MatchupWindow,
  PlayerKind,
  ResearchRow,
  RotationProjection,
  ScheduleGame,
  ScheduleWindow,
  StartTier,
} from '../types';

/**
 * ---------------------------------------------------------------------------
 * The Schedule view — one column per day, one row per player, each cell naming
 * that day's opponent.
 * ---------------------------------------------------------------------------
 *
 * It answers the fantasy manager's weekly question, which neither of the two
 * wide tables could: *who plays how many games this week, against whom, and
 * which of my starters gets two turns.* Both of those tables are cut by past
 * performance and this is the one reading of a roster that looks forward.
 *
 * **It is a mode of those two tables rather than a page**, and the whole of
 * that argument is in `docs/claude/client-summary.md`. What lives here is the
 * half both tables share: the index, the cell, the counts, and the columns the
 * research board splices in — one definition, so a day read on the roster and
 * the same day read on the board cannot come to say two things.
 */

/**
 * The spans offered. **Two of them are days and two are a fantasy matchup**,
 * and the pair is what a connected league adds to this control.
 *
 * The numeric two answer *how far ahead*, and they are unchanged: seven is a
 * planning week and fourteen is as far as the schedule can usefully be read.
 * The named two answer a different question and the one a fantasy manager
 * actually asks — *how many games do I get **this week**, and how many next* —
 * where "week" is his league's own matchup period rather than seven days from
 * today. Those two are rarely the same span: on the live league today, this
 * matchup runs Aug 10–23 (a fortnight's playoff round, of which eight days are
 * left) and next runs Aug 24 – Sep 6.
 *
 * `matchup` starts **today** rather than at the period's own start, for the
 * reason the numeric spans do: the days already played are not days anybody can
 * plan for, and every other column in this view is a day still to come.
 */
export type ScheduleSpan = 7 | 14 | 'matchup' | 'next';
/** The two that need no league, and the **fallback** rather than the base of
 *  the run: they are what the control offers where a league cannot name both
 *  of its own weeks. See `scheduleSpans`. */
export const SCHEDULE_SPANS: ScheduleSpan[] = [7, 14];

/** `sched=7` / `sched=14` / `sched=matchup` / `sched=next`; anything else
 *  (including absence) is off. A span this reader is not offered resolves to
 *  the one that *is* when it is **drawn** rather than being dropped here — see
 *  `effectiveSpan`, and the rule `cols=` follows: a link says what it meant
 *  even where this reader cannot honor it. */
export function toScheduleSpan(v: string | null): ScheduleSpan | null {
  return v === '7' ? 7 : v === '14' ? 14 : v === 'matchup' ? 'matchup' : v === 'next' ? 'next' : null;
}

/**
 * Which spans this reader can actually be offered, in reading order.
 *
 * **A league that can name both of its own weeks is offered those two and
 * nothing else** — `Next 7` and `Next 14` are a *fallback*, not a fifth and
 * sixth thing to choose between. A manager whose league runs matchup periods
 * plans in matchup periods, and a rolling week that starts today and ends in
 * the middle of one answers a question he is not asking; four pills where two
 * will do is a control asking him to think about which kind of week he means
 * every time he reads the table.
 *
 * **The numeric pair comes back the moment the named one is incomplete**, which
 * is the whole of the fallback and is why the test is on both spans rather than
 * on the league: the last matchup period of a season has no `next`, and a
 * segmented control holding a single option is a control with no choice in it
 * — the argument the matchup page's own strip makes for a bye. There the run is
 * `Week 22 · Next 7 · Next 14` and the reader keeps somewhere to go.
 */
export function scheduleSpans(matchup: MatchupWindow | null): ScheduleSpan[] {
  if (!matchup) return SCHEDULE_SPANS;
  return matchup.next ? ['matchup', 'next'] : ['matchup', ...SCHEDULE_SPANS];
}

/** What the mode opens on. **This matchup where there is one**, which is the
 *  fantasy week the reader is in; seven days otherwise. */
export function defaultScheduleSpan(matchup: MatchupWindow | null): ScheduleSpan {
  return matchup ? 'matchup' : 7;
}

/**
 * The span actually in force — **whatever was asked for if this reader is
 * offered it, and the default if not**.
 *
 * One rule where there were two, and it had to become one when the numeric pair
 * stopped always being offered: a `sched=7` link opened by somebody whose
 * league names both its weeks now falls back to this week exactly as a
 * `sched=matchup` link opened without a league falls back to `Next 7`. Either
 * way the control marks the span the table is actually drawing, which is the
 * one thing it must not get wrong; the URL keeps what it was handed, the rule
 * `cols=` follows.
 */
export function effectiveSpan(
  span: ScheduleSpan,
  matchup: MatchupWindow | null,
): ScheduleSpan {
  return scheduleSpans(matchup).includes(span) ? span : defaultScheduleSpan(matchup);
}

/**
 * The span one step either side of this one in the run this reader is offered,
 * or null at either end of it.
 *
 * **This is what the date bar's arrows navigate while the Schedule view is the
 * reading**, and it is deliberately the *offered* run rather than all four
 * spans: a league that names both its own weeks is offered two, and an arrow
 * that stepped onto `Next 7` there would produce a span the pills beside it do
 * not contain. `effectiveSpan` first, for the same reason the control marks
 * with it — a `sched=7` link opened by such a reader is already drawing
 * this week, and the step has to start from what is on screen.
 */
export function stepSpan(
  span: ScheduleSpan,
  matchup: MatchupWindow | null,
  delta: -1 | 1,
): ScheduleSpan | null {
  const run = scheduleSpans(matchup);
  const i = run.indexOf(effectiveSpan(span, matchup)) + delta;
  return i >= 0 && i < run.length ? run[i] : null;
}

/**
 * The first and last day a span actually draws — **what the date bar prints
 * while the Schedule view is the reading**, that view's columns being the days
 * on screen rather than the date range.
 *
 * Off the index where it has landed, since those are the days the columns
 * really are (a season ending inside the span draws the days it has). Off the
 * span's own definition while the window is still being read, so the bar states
 * a span rather than going blank for the length of a fetch — the same numbers
 * within a day either way, and the index corrects it the moment it arrives.
 */
export function spanDates(
  index: ScheduleIndex | null,
  span: ScheduleSpan,
  matchup: MatchupWindow | null,
  today: string,
): { start: string; end: string } {
  if (index && index.dates.length > 0) {
    return { start: index.dates[0], end: index.dates[index.dates.length - 1] };
  }
  const eff = effectiveSpan(span, matchup);
  if (eff === 'matchup' && matchup) {
    return { start: today, end: matchup.end < today ? today : matchup.end };
  }
  if (eff === 'next' && matchup?.next) {
    return { start: matchup.next.start, end: matchup.next.end };
  }
  const days = eff === 14 ? 14 : 7;
  return { start: today, end: addDays(today, days - 1) };
}

/** `8/16 – 8/23` — a span's own dates, which is what makes a named one
 *  readable: "this matchup" is a phrase until it says which days it is. */
function shortDate(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export interface SpanLabel {
  /** What the pill and the `<option>` read. */
  label: string;
  /** The dates it covers, and for a numeric span the days it is. */
  title: string;
}

/**
 * **A named span is called `Week 19`, not `This Matchup`, and the reason is a
 * measurement rather than a preference.**
 *
 * The rows this strip rides in were laid out for the fallback pair, and a named
 * span that costs more than the pair it stands in for costs the reader a line
 * of pinned chrome. Measured on the research board at 1200 (the bar's own
 * wrapping row, batters and pitchers alike), the narrowest window at which the
 * tools run and the strip share a line: `Next 7 · Next 14` **1200**,
 * `This Matchup · Next Matchup` **1280**, `Week 19 · Week 20` **1200**. At 1200
 * the long pair therefore took a third line and the pinned chrome went 161 →
 * 207 for a control 228px wide.
 *
 * **And the word is the app's own.** A matchup period is `Week 19` on the
 * League page's scoreboard head and on a matchup's own head, so this is the
 * vocabulary the reader already has — it says *which* fantasy week rather than
 * that it is the current one, which is strictly more than `This Matchup` said,
 * and the tooltip goes on expanding it (`The rest of matchup period 19 —
 * 8/10 – 8/23`). `This Week` / `Next Week` was rejected outright and not on
 * width: the date presets an inch away already carry a `This week`, which is
 * the *calendar* week — two controls a press apart reading the same words and
 * meaning two different weeks is the one thing this run must not say.
 *
 * **The two pills are the same width by construction**, which is what keeps the
 * control from changing size under the finger that pressed it: measured, both
 * `Week 19` and `Week 20` are 75.8px, and `Week 22` / `Week 23` are 75.8 too —
 * the digits are the same advance, so no week number moves it.
 */
export function spanLabel(span: ScheduleSpan, matchup: MatchupWindow | null): SpanLabel {
  const range = (from: string, to: string) => `${shortDate(from)} – ${shortDate(to)}`;
  if (span === 'matchup' && matchup) {
    return {
      label: `Week ${matchup.period}`,
      // The period's own dates rather than the days drawn: the columns start
      // today, and what the reader is being told is which fantasy week this is.
      title: `The rest of matchup period ${matchup.period} — ${range(matchup.start, matchup.end)}`,
    };
  }
  if (span === 'next' && matchup?.next) {
    return {
      label: `Week ${matchup.next.period}`,
      title: `Matchup period ${matchup.next.period} — ${range(matchup.next.start, matchup.next.end)}`,
    };
  }
  const days = span === 14 ? 14 : 7;
  return { label: `Next ${days}`, title: `The next ${days} days` };
}

/**
 * The window, turned into the two lookups both tables want: the days across the
 * top, and a club's games on each of them.
 *
 * A **doubleheader is two games on one date**, which is why the inner value is
 * an array rather than a game: a club that plays twice on Tuesday is a club
 * whose hitters get two Tuesdays, and a count that collapsed them would be the
 * one number this view exists to give and would be wrong.
 */
export interface ScheduleIndex {
  /** The span **in force** — a named one that could not be resolved has already
   *  fallen back here, so everything downstream (the count columns' own
   *  sentence above all) describes the days actually drawn. */
  span: ScheduleSpan;
  /** The ET days the columns are, in order. From today for every span but
   *  `next`, which starts on the next matchup period's own first day; a
   *  numeric span is that many of them and a named one is however many the
   *  period has. */
  dates: string[];
  /**
   * Today, as the **server** named it, rather than as the client would.
   *
   * The two agree — `App.tsx` mirrors the 3am ET rollover by hand — and the
   * point is that they cannot come to disagree about which column is headed
   * `Today`: the window is built from the server's `baseballToday()`, so a tab
   * left open past the rollover reads the header off the same day the data is
   * for rather than off a clock that has moved on without it. It is deliberately
   * not `dates[0]`, which is the first day with a *game* and so is tomorrow on a
   * league-wide off day.
   */
  today: string;
  /**
   * **The span runs past the window the server answered for**, so the columns
   * stop short of the period and every count on the row is short with them.
   *
   * It cannot happen in a league whose periods are a week or a fortnight — the
   * window is 28 days and the widest *this matchup + next* such a league can
   * ask for is 14 + 14 (see `SCHEDULE_DAYS`) — so this is here for the league
   * that runs three-week rounds, and for the honesty rule rather than for the
   * likelihood: a cap this view cannot avoid is one it has to *say*, which the
   * count columns' own titles do. A span that merely runs out of **games** —
   * the end of the regular season — is not short: the schedule really has no
   * more days, and drawing the ones it has is the truth.
   */
  short: boolean;
  /** club id → date → that club's games that day. */
  byTeam: Map<number, Map<string, ScheduleGame[]>>;
  /**
   * Player id → the `gamePk`s of his projected turns, and how much of a guess
   * they are.
   *
   * **A `Set` per pitcher rather than a list**, because the question this answers
   * is asked once per row per column — 275 rows by 14 days is 3,850 lookups on
   * one draw of the board, and a linear scan of five gamePks each is the kind of
   * thing that is free until it isn't.
   */
  rotations: Map<number, { starts: Set<number>; cadence: number; estimated: boolean }>;
  /**
   * `gamePk` → club id → **the man that club is starting**, announced or
   * projected — which a cell reads for the *other* side, so a row says who its
   * player is up against.
   *
   * Keyed by club rather than by side because that is the question a cell asks:
   * a row knows its own club, so the opposing club is one subtraction and the
   * lookup is then two `Map` reads on a grid drawn thousands of times.
   *
   * **A side nobody can be named for is absent rather than empty**, the rule
   * every join in this app fails in — see `buildStarters` for the four ways
   * that happens.
   */
  starters: Map<number, Map<number, OpposingStarter>>;
}

/** The opposing starter as a cell draws him — resolved once, at index time,
 *  rather than per cell per row. */
export interface OpposingStarter {
  id: number;
  /** `RHP Alcantara` — hand and surname, the vocabulary the summary table's
   *  opponent cell and the feed's Upcoming bar already write him in. */
  label: string;
  /** `Sandy Alcantara (RHP)` — the whole of him, for the cell's own title. */
  full: string;
  /** `Sandy Alcantara` — the plain name, for the places that draw him as a
   *  person rather than as a cell: the game preview's starter line puts the
   *  hand on its own row and would otherwise print it twice. Carried rather
   *  than parsed back out of `full`, which would be reading a string this file
   *  wrote to recover a field it had — the reason `hand` is carried too. */
  name: string;
  /** Which arm he throws with, raw — `R`, `L` or null where the roster has no
   *  answer. The grid has never needed it (its cell prints `label`), and the
   *  player page's Schedule tab does: a batter's row opens the half of his
   *  platoon split this man creates, which is a question about the hand rather
   *  than about the name. Carried rather than parsed back out of `label`, which
   *  would be reading a word this file wrote to recover a field it had. */
  hand: string | null;
  tier: StartTier;
}

/** What the index needs of the season roster to name a pitcher: his name and
 *  which arm he throws with. `App.tsx` holds that list from boot for the header
 *  search, so this costs no request — see `docs/claude/client-summary.md`. */
export type PitcherLookup = (id: number) => { name: string; throws: string | null } | undefined;

/**
 * Which club each pitcher in the window belongs to.
 *
 * **The wire says who is starting and never says for whom**, which is the one
 * thing standing between `rotations` and this feature: a projection is a list
 * of `gamePk`s hung off a player id, and a game names two clubs. So the club is
 * derived, by two routes that check each other:
 *
 * - **An announced probable names his club outright** — he *is* `homeProbableId`
 *   of a game whose home club is that club. No inference at all.
 * - **A pitcher's projected turns are all his own club's games**, so the club
 *   common to every one of them is his. Two games are enough to settle it and
 *   most pitchers have five.
 *
 * **Measured on the live 28-day window rather than assumed**: all 163 pitchers
 * with a projection resolve to exactly one club — 77 by announcement, 86 by
 * intersection — and where both routes answer, they **agree on all 77 with 0
 * disagreements**. Not one projected turn lands on a game its own pitcher's club
 * is not a side of. A pitcher the intersection cannot narrow to one club (a
 * single projected turn, no announcement anywhere in the window — which does not
 * occur today) is left out, and the sides he would have filled draw nothing.
 */
function clubByPitcher(win: ScheduleWindow, byPk: Map<number, ScheduleGame>): Map<number, number> {
  const club = new Map<number, number>();
  for (const g of win.games) {
    if (g.homeProbableId) club.set(g.homeProbableId, g.homeId);
    if (g.awayProbableId) club.set(g.awayProbableId, g.awayId);
  }
  for (const [id, r] of Object.entries(win.rotations ?? {})) {
    const pid = Number(id);
    if (club.has(pid)) continue;
    let cand: number[] | null = null;
    for (const pk of (r as RotationProjection).starts) {
      const g = byPk.get(pk);
      if (!g) continue;
      cand = cand === null ? [g.homeId, g.awayId] : cand.filter((c) => c === g.homeId || c === g.awayId);
      if (cand.length === 0) break;
    }
    if (cand?.length === 1) club.set(pid, cand[0]);
  }
  return club;
}

/**
 * Who each club is starting in each game of the window.
 *
 * **Announced beats projected and the two can never collide**, which is the
 * server's own guarantee restated (a projected turn is never placed on a game
 * somebody is named for) and was checked: of 750 game-sides on the live window,
 * **0** carry both.
 *
 * **Nobody is named where the answer is not one man**, and there are four ways
 * that happens — each a silence rather than a guess, which is the direction every
 * join in this app fails in:
 *
 * - **The club could not be derived** (`clubByPitcher`, above). 0 on the live
 *   window.
 * - **Two of a club's starters project onto one game.** `rotations.ts` steps each
 *   pitcher's slot forward independently, so slots collide — measured, **90 of
 *   750 game-sides** have two candidates (84) or three (6), and there is nothing
 *   in the payload to prefer one: cadence says how often he goes, not who is up.
 *   Naming either would be naming the wrong man about half the time.
 * - **The season roster has never heard of him** — 11 of 750, a pitcher off the
 *   list the header search matches against, who therefore has no name to print.
 * - **Nobody is starting at all**, announced or projected — 39 of 750, a club
 *   whose rotation the server declines to project.
 *
 * What is left is **621 of 750 (82.8%)**: 75 announced, 499 projected off a
 * pitcher's own pace, 36 estimated off his club's. Against the 75 an announcement
 * could name on its own, which is the whole argument for reading the projection
 * here at all.
 */
function buildStarters(
  win: ScheduleWindow,
  byPk: Map<number, ScheduleGame>,
  pitchers: PitcherLookup | null,
): Map<number, Map<number, OpposingStarter>> {
  const out = new Map<number, Map<number, OpposingStarter>>();
  if (!pitchers) return out;
  const named = (id: number, tier: StartTier): OpposingStarter | null => {
    const p = pitchers(id);
    if (!p) return null;
    const hand = handThrows(p.throws);
    return {
      id,
      label: `${hand} ${surname(p.name)}`,
      full: `${p.name} (${hand})`,
      name: p.name,
      hand: p.throws,
      tier,
    };
  };
  const put = (pk: number, teamId: number, s: OpposingStarter) => {
    let m = out.get(pk);
    if (!m) out.set(pk, (m = new Map()));
    m.set(teamId, s);
  };
  // Announced first, so a collision can only ever cost a *projected* turn its
  // place — and the ambiguity pass below then leaves the announced one standing.
  for (const g of win.games) {
    if (g.state === 'postponed') continue;
    if (g.homeProbableId) {
      const s = named(g.homeProbableId, 'announced');
      if (s) put(g.gamePk, g.homeId, s);
    }
    if (g.awayProbableId) {
      const s = named(g.awayProbableId, 'announced');
      if (s) put(g.gamePk, g.awayId, s);
    }
  }
  const club = clubByPitcher(win, byPk);
  // A club that two slots land on is struck out rather than resolved: the second
  // candidate replaces the first with a marker, and the marker is what the pass
  // after this reads to delete the entry. A `Set` of struck keys rather than a
  // sentinel in the map, so the type stays what it says it is.
  const struck = new Set<string>();
  for (const [id, r] of Object.entries(win.rotations ?? {})) {
    const pid = Number(id);
    const c = club.get(pid);
    if (c === undefined) continue;
    for (const pk of (r as RotationProjection).starts) {
      const g = byPk.get(pk);
      if (!g || g.state === 'postponed') continue;
      if (c !== g.homeId && c !== g.awayId) continue;
      const key = `${pk}:${c}`;
      if (out.get(pk)?.has(c)) {
        // Announced already, or a second projection — either way not one man.
        if (out.get(pk)!.get(c)!.tier !== 'announced') struck.add(key);
        continue;
      }
      const s = named(pid, (r as RotationProjection).estimated ? 'estimated' : 'projected');
      if (s) put(pk, c, s);
    }
  }
  for (const key of struck) {
    const [pk, c] = key.split(':');
    out.get(Number(pk))?.delete(Number(c));
  }
  return out;
}

export function buildScheduleIndex(
  win: ScheduleWindow,
  span: ScheduleSpan,
  matchup: MatchupWindow | null = null,
  pitchers: PitcherLookup | null = null,
): ScheduleIndex {
  // The dates are taken from the games rather than generated from `start`, so
  // the columns are the days the server actually answered for — a short window
  // (a season ending inside it) then draws the days it has instead of a run of
  // empty columns claiming the schedule has run out.
  const all = [...new Set(win.games.map((g) => g.date))].sort();
  // A **named** span is a date range and a numeric one is a count of days, and
  // the difference is the whole of what a matchup span is: `Next 7` is the
  // first seven days with games, where the named span is every day up to the
  // period's own last, however many that is. Both then intersect the window,
  // which is what keeps a span the schedule cannot reach drawing the days it
  // has rather than inventing the rest — and the window is now long enough to
  // cover both by construction (see `SCHEDULE_DAYS`).
  const eff = effectiveSpan(span, matchup);
  const dates =
    eff === 'matchup' && matchup
      ? all.filter((d) => d <= matchup.end)
      : eff === 'next' && matchup?.next
        ? all.filter((d) => d >= matchup.next!.start && d <= matchup.next!.end)
        : all.slice(0, eff === 14 ? 14 : 7);
  const inSpan = new Set(dates);
  const byTeam = new Map<number, Map<string, ScheduleGame[]>>();
  const put = (teamId: number, g: ScheduleGame) => {
    let days = byTeam.get(teamId);
    if (!days) byTeam.set(teamId, (days = new Map()));
    const list = days.get(g.date);
    if (list) list.push(g);
    else days.set(g.date, [g]);
  };
  for (const g of win.games) {
    if (!inSpan.has(g.date)) continue;
    put(g.homeId, g);
    put(g.awayId, g);
  }
  // The window's own last day rather than the last day with a game in it: the
  // question is whether the *server* was asked far enough ahead, not whether
  // anybody is playing.
  const wants = eff === 'matchup' && matchup ? matchup.end : eff === 'next' && matchup?.next ? matchup.next.end : null;
  // The server keys these by player id and sends only the **unannounced** turns:
  // an announced one is already on the game as `homeProbableId`/`awayProbableId`,
  // so repeating it would be one fact in two places (see `RotationProjection`).
  // They are not cut to the span — a `Set` membership test is what reads them and
  // a pk outside the drawn columns is never asked about.
  const rotations = new Map<number, { starts: Set<number>; cadence: number; estimated: boolean }>();
  for (const [id, r] of Object.entries(win.rotations ?? {})) {
    const p = r as RotationProjection;
    rotations.set(Number(id), {
      starts: new Set(p.starts),
      cadence: p.cadence,
      estimated: p.estimated,
    });
  }
  // Both of these read the **whole window** rather than the span, and that is
  // deliberate: a club is derived from every game a pitcher's slot touches, so
  // narrowing the evidence to seven days would leave a man with one turn inside
  // it unresolvable when the fortnight around it settles him. What is drawn is
  // then cut by the columns, which is the span's own job.
  const byPk = new Map(win.games.map((g) => [g.gamePk, g]));
  return {
    span: eff,
    dates,
    today: win.start,
    short: wants !== null && wants > win.end,
    byTeam,
    rotations,
    starters: buildStarters(win, byPk, pitchers),
  };
}

/**
 * How the count columns name their own span in a sentence — **exported,
 * because both tables draw those columns and each writes its own header.** The
 * summary table restated `the next N days` by hand, which read `the next
 * matchup days` the moment a span stopped being a number; one function is what
 * stops a day counted here and the same day counted there being described two
 * ways.
 *
 * The index carries the *effective* span, so a named one that fell back reads
 * as the days it actually drew rather than as the matchup it could not.
 */
export function spanPhrase(index: ScheduleIndex): string {
  // A span the window could not reach says so rather than under-counting in
  // silence — see `ScheduleIndex.short`.
  const cut = index.short
    ? `, as far as the schedule reaches (to ${index.dates[index.dates.length - 1] ?? '—'})`
    : '';
  if (index.span === 'matchup') return `in the rest of this matchup period${cut}`;
  if (index.span === 'next') return `in the next matchup period${cut}`;
  return `in the next ${index.span} days`;
}

/** A club's games on one day of the span — empty on an off day. */
export function gamesOn(index: ScheduleIndex, teamId: number | null, date: string): ScheduleGame[] {
  if (teamId === null) return [];
  return index.byTeam.get(teamId)?.get(date) ?? [];
}

/**
 * Is he starting this game, and how sure is that?
 *
 * **Three answers where this used to have two**, and the middle two are the
 * whole of what the view gained: `announced` is his club naming him, `projected`
 * is his own rotation slot stepped over the schedule, and `estimated` is his
 * club's rotation standing in where his own record is too thin to read. Null is
 * "not his game". See `StartTier`, and `server/src/rotations.ts` for how each is
 * arrived at and what it was measured against.
 *
 * The announced test comes first and cannot tie with the other two: the server
 * never places a projected turn on a game somebody is named for, so a game he is
 * announced for is never in his `starts` set.
 */
export function startTierOn(
  index: ScheduleIndex,
  g: ScheduleGame,
  teamId: number,
  playerId: number,
): StartTier | null {
  if ((g.homeId === teamId ? g.homeProbableId : g.awayProbableId) === playerId) return 'announced';
  const r = index.rotations.get(playerId);
  if (!r || !r.starts.has(g.gamePk)) return null;
  return r.estimated ? 'estimated' : 'projected';
}

/** His rotation slot, for the sentence a count or a chip says about it. */
export function rotationOf(index: ScheduleIndex, playerId: number) {
  return index.rotations.get(playerId) ?? null;
}

/**
 * Who the *other* club is starting in this game — the fact a manager decides a
 * hitter's week on, and the one thing a cell naming an opponent could never say.
 *
 * The row's own club is what makes the question answerable: the opposing club is
 * the side of the game that is not his, and the index has already resolved one
 * man per club per game (`buildStarters`). Null where that resolution came to
 * anything but one man, which is a silence rather than a dash — a dash in this
 * grid means *no game*, and a cell that said it about a starter would be saying
 * the wrong thing in the vocabulary the column has already taught.
 */
export function opposingStarter(
  index: ScheduleIndex,
  g: ScheduleGame,
  teamId: number | null,
): OpposingStarter | null {
  if (teamId === null || g.state === 'postponed') return null;
  const other = g.homeId === teamId ? g.awayId : g.homeId;
  return index.starters.get(g.gamePk)?.get(other) ?? null;
}

/** What each tier of an *opposing* starter says on hover. The player's own
 *  chip has `TIER_TITLE`, which is written about him ("his club has announced
 *  him"); this is the same three facts about the man on the other side.
 *
 *  **Exported because the player page's Schedule tab draws the same line** in a
 *  row rather than a cell (`PlayerSchedule.tsx`) — the same three facts about
 *  the same man, so the sentence is written once. */
export const VS_TITLE: Record<StartTier, string> = {
  announced: 'announced by his club',
  projected: 'projected from his own rotation slot — nobody has announced this one yet',
  estimated: "estimated from his club's rotation, his own record being too thin to read one off",
};

/**
 * Games in the span his club is actually going to play.
 *
 * **A postponement is not a game he gets**, so it is out of the count — which
 * matters more than it sounds, that count being the half of the question the
 * reader came for. A game already final today *is* counted: the span starts
 * today and "how many games this week" is asked of a week that has begun.
 */
export function gameCount(index: ScheduleIndex, teamId: number | null): number {
  if (teamId === null) return 0;
  const days = index.byTeam.get(teamId);
  if (!days) return 0;
  let n = 0;
  for (const list of days.values()) for (const g of list) if (g.state !== 'postponed') n += 1;
  return n;
}

/** How many turns he gets in the span, split by how sure each one is. */
export interface StartTally {
  announced: number;
  projected: number;
  estimated: number;
  /** All three — what the `GS` column prints. */
  total: number;
}

/**
 * Turns he gets in the span: the ones his club has named, and the ones his
 * rotation slot puts him in.
 *
 * **This used to count announcements alone, and the reason it did no longer
 * holds.** The old rule was the feed's — *"an announcement is the only thing that
 * puts him there"* — on the measured grounds that clubs name a probable about
 * three days out (28/28 today, 30/30 at two days, then **3/22 at three, 1/30 at
 * four and none beyond**), so over a week a projection is "right about one of
 * them and states the other four as facts". What that measurement actually says
 * is that *an announcement cannot answer this column's question*: a `GS` of 1 for
 * every starter in the league is a column of noise, and **which of my starters
 * gets two turns** — the single most actionable thing this view can say — was
 * unanswerable by construction.
 *
 * So the count is all three tiers and the **tally says which**, because the
 * projection is now measured rather than guessed: against real announcements,
 * hidden and re-derived, a pitcher's own cadence lands his next start **38 of 48
 * exact and 48 of 48 within a day**, and his club's cadence 9 of 9. The column's
 * own title names the split, and a count carrying a projected turn is drawn
 * differently from one that is all fact.
 */
export function startTally(
  index: ScheduleIndex,
  teamId: number | null,
  playerId: number,
): StartTally {
  const tally: StartTally = { announced: 0, projected: 0, estimated: 0, total: 0 };
  if (teamId === null) return tally;
  const days = index.byTeam.get(teamId);
  if (!days) return tally;
  for (const list of days.values()) {
    for (const g of list) {
      if (g.state === 'postponed') continue;
      const tier = startTierOn(index, g, teamId, playerId);
      if (tier === null) continue;
      tally[tier] += 1;
      tally.total += 1;
    }
  }
  return tally;
}

/**
 * The weakest tier in a tally — what its cell is drawn as, so a `2` made of one
 * announcement and one estimate reads as the estimate it partly is rather than
 * as two facts.
 */
export function tallyTier(t: StartTally): StartTier | null {
  if (t.estimated > 0) return 'estimated';
  if (t.projected > 0) return 'projected';
  if (t.announced > 0) return 'announced';
  return null;
}

/** `1 announced · 2 projected` — the tally in words, for a cell's own title. */
export function tallyWords(t: StartTally): string {
  const parts: string[] = [];
  if (t.announced) parts.push(`${t.announced} announced`);
  if (t.projected) parts.push(`${t.projected} projected from his own pace`);
  if (t.estimated) parts.push(`${t.estimated} estimated from his club's rotation`);
  return parts.join(' · ');
}

/** `@ LAD` / `vs SEA` — what a cell says, and what its column sorts on. */
/**
 * **The opposing club as a press**, wherever a table names one.
 *
 * The abbreviation is what every table in this app calls a club, and it is the
 * thing a reader is already looking at while deciding whether to start somebody
 * against them — so it is the natural handle for *the whole matchup*, which is
 * what pressing it opens: the same game preview the feed's Upcoming row and the
 * player page's Schedule row raise, with the park, and his split against the
 * announced starter, or the lineup waiting for him.
 *
 * **It led to the club's page for one commit and no longer does.** The club is
 * still one press further on — the venue's name inside the preview is a door to
 * it — but a reader pressing `vs MIL` on his own roster is asking *what is this
 * game*, not *who are the Brewers*, and the club page answers the second
 * question at the cost of the first.
 *
 * **The text is unchanged and the whole of it is the target.** `vs MIL` is
 * eleven characters at 12px, a small aimed target already; splitting the press
 * off the `vs` would halve it for no gain, the prefix being part of the same
 * fact. A cell with nothing to open — see `canPreview` and `canPreviewFixture`
 * — draws the plain text it always was rather than a press that does nothing.
 */
export function OpponentPress({
  onPress,
  label,
  title,
  opens = 'dialog',
}: {
  /** What opens, or null where there is nothing to. */
  onPress: (() => void) | null;
  /** What the cell already says — `vs MIL`, `@ TOR`, or a bare `MIL`. */
  label: string;
  title?: string;
  /**
   * **Which of the two things this press opens**, and the only reason the
   * component needs telling: `aria-haspopup="dialog"` is a promise to a screen
   * reader that a dialog is coming back, and a cell whose game has been
   * *played* opens a full page instead — a game's own, with its box score and
   * its plays. Announcing that as a dialog would be the one thing this app's
   * overlay rules are careful about, said wrongly.
   *
   * `dialog` is the default because it is what the cell has always opened and
   * what every fixture still opens. See `SummaryTable.tsx::OpponentCell`, which
   * chooses between them on the game's state.
   */
  opens?: 'dialog' | 'page';
}) {
  if (!onPress) return <>{label}</>;
  return (
    <button
      type="button"
      className="opp-door"
      aria-haspopup={opens === 'dialog' ? 'dialog' : undefined}
      onClick={(e) => {
        // The row around this has its own press targets — the headshot and the
        // name open the player. Nothing here should reach them.
        e.stopPropagation();
        onPress();
      }}
      title={title ?? `${label} — open the matchup`}
    >
      {label}
    </button>
  );
}

export function opponentText(g: ScheduleGame, teamId: number): string {
  const home = g.homeId === teamId;
  return `${home ? 'vs' : '@'} ${home ? g.away : g.home}`;
}

/** The whole day's matchups as one string, for the sort and the tooltip. */
export function dayText(
  index: ScheduleIndex,
  teamId: number | null,
  date: string,
): string | null {
  const games = gamesOn(index, teamId, date);
  if (games.length === 0) return null;
  return games.map((g) => opponentText(g, teamId as number)).join(' · ');
}

/** What each tier's chip says on hover, in the cell and in the `GS` column
 *  alike — one sentence per tier so the grid and the count cannot describe the
 *  same fact two ways. */
export const TIER_TITLE: Record<StartTier, string> = {
  announced: 'his club has announced him to start',
  projected: 'projected to start — his own rotation slot, which nobody has announced yet',
  estimated: "estimated to start — his club's rotation, his own record being too thin to read one off",
};

/** `SP`, the legend that breaks the bottom stroke of the box drawn around the
 *  opponent — upright where his club has named him, italic where nobody has.
 *  The class grades it; `.sched-opp-box` is the box it is the legend of. */
export function StartChip({ tier, cadence }: { tier: StartTier; cadence?: number | null }) {
  const turn =
    tier === 'announced' || cadence == null
      ? ''
      : ` (a turn every ${cadence} club ${cadence === 1 ? 'game' : 'games'})`;
  return (
    <span className={`sched-sp sched-sp-${tier}`} title={`${TIER_TITLE[tier]}${turn}`}>
      SP
    </span>
  );
}

/**
 * One day's cell.
 *
 * The `<td>` belongs to whichever table is drawing — the board owns its own,
 * the summary table its own — so everything this needs to say it says on a
 * `<span>` of its own. That is what lets one function serve both without either
 * table needing a `cellClass` rule for the other's sake.
 *
 * Three things are drawn and each is a state rather than a value, which is the
 * only thing these tables spend color on: a **live** game's opponent takes the
 * accent green the summary table's own opponent cell gives a live inning, a
 * **postponement** reads `PPD` in the same amber that cell uses, and a game
 * already **final** goes muted, so today's column says at a glance which of its
 * games are still to come. An off day is a faint dash — quiet on purpose, so a
 * row's games are what the eye lands on when it scans across.
 *
 * **A starting pitcher's own game is the opponent inside a box, with `SP`
 * breaking the bottom stroke** — a fieldset legend, which is what the mark is:
 * the day is what carries the fact, so the border goes round the day rather
 * than a pill going under it. Three weights, and the ladder is the app's own —
 * a **solid accent** stroke where his club has named him, a **solid muted** one
 * where his own rotation slot puts him there, a **dashed** one where his club's
 * rotation does (the percentile card's dotted bubble, the Splits card's hatched
 * fill). **The legend goes italic on the two nobody has announced**, so the
 * word itself carries the caveat; the sentence is on its own title.
 *
 * **And every cell names the man the other club is throwing** — `RHP
 * Alcantara`, hand and surname, which is the vocabulary the summary table's
 * opponent cell and the feed's Upcoming bar already write a starter in and the
 * one fact a manager decides a hitter's week on. It takes the same three
 * weights as the count column beside it (`.sched-gs`): nothing added where his
 * club has named him, **italic** where it is our own reading of his slot, and
 * italic under a dashed line where it is his club's rotation standing in. Where
 * the answer is not one man — see `buildStarters`, which enumerates the four
 * ways — the line is simply absent, because a dash in this grid already means
 * *no game*.
 */
export function ScheduleCell({
  index,
  teamId,
  playerId,
  date,
  onPreview,
}: {
  /** Open this fixture's preview. Absent on any caller that has no dialog to
   *  raise, which leaves every opponent here as the plain text it was. */
  onPreview?: (g: ScheduleGame) => boolean | void;
  index: ScheduleIndex;
  teamId: number | null;
  playerId: number;
  date: string;
}): ReactNode {
  const games = gamesOn(index, teamId, date);
  if (games.length === 0) {
    return (
      <span className="sched-cell sched-off" title="No game">
        —
      </span>
    );
  }
  const rotation = rotationOf(index, playerId);
  // A doubleheader draws both matchups stacked; they are almost always the same
  // opponent, and saying so twice is cheaper than a "×2" the reader has to
  // decode — and where a club splits a day between two clubs it is the truth.
  return (
    <>
      {games.map((g) => {
        const ppd = g.state === 'postponed';
        // A postponed game is not a turn — the projection never places one on it
        // and an announcement for it means nothing now.
        const tier = ppd || teamId === null ? null : startTierOn(index, g, teamId, playerId);
        const opp = opponentText(g, teamId as number);
        // The club on the other side of this fixture — one subtraction, the row
        // knowing its own. It is what the opponent's abbreviation is a door to.
        // **Only a fixture nobody has played is a preview.** A preview is a
        // reading of a game *before* it — the split against the man they have
        // named, the lineup waiting — so a live or final cell keeps its plain
        // text and lets the score be the answer.
        const press =
          onPreview && g.state === 'scheduled' ? () => void onPreview(g) : null;
        const vs = opposingStarter(index, g, teamId);
        /* **Which half of the pair**, on the title alone and never in the cell.
           The stacked lines already say the club plays twice, and they are now
           stacked in the order the games are played — `schedule.ts::dedupe`
           orders a day by `gameNumber`, where it used to order by `gamePk` and
           put the nightcap on top for 30 of the 2026 season's 44 doubleheader
           club-days. What the stack cannot say is *which line is which*, and
           that is exactly what a start mark on one of them needs; a `Gm 2` drawn
           in the cell would be a third line of text in a grid whose whole point
           is being scannable at 600 rows, so it goes on the title the cell
           already carries. The two list surfaces that draw a fixture a row at a
           time — the Schedule tab and the Projected Starts block — draw it
           visibly, having the room and no stack to imply it. */
        const half = games.length > 1 ? `game ${g.gameNumber} of a doubleheader` : null;
        const title = ppd
          ? `${opp} — postponed`
          : [
              opp,
              half,
              tier ? TIER_TITLE[tier] : null,
              vs ? `${vs.full} — ${VS_TITLE[vs.tier]}` : null,
            ]
              .filter(Boolean)
              .join(' — ');
        return (
          <span
            key={g.gamePk}
            className={`sched-cell sched-${g.state}${tier ? ` sched-start sched-start-${tier}` : ''}`}
            title={title}
          >
            {/* The box is drawn **only on a start day**, and the two lines are
                the same `<span>`s either way — the box is what a legend needs a
                containing block for, and a cell with no start has nothing to
                legend. Its border is laid out rather than painted, so it is
                added where it is spoken for rather than reserved everywhere.

                **Both lines go inside it**, the opponent and the man the other
                club is throwing. The stroke is a mark about a *day*, and the
                pitcher he is opposed by is a fact about that same day — drawn
                round the first line alone it read as a box round `vs PIT` with
                a caption loose underneath, which is the pill-under-the-opponent
                shape this device replaced, one line lower. */}
            {tier ? (
              <span className={`sched-opp-box sched-opp-box-${tier}`}>
                <span className="sched-opp">
                  <OpponentPress onPress={press} label={opp} />
                </span>
                {vs && <span className={`sched-vs sched-vs-${vs.tier}`}>{vs.label}</span>}
                <StartChip tier={tier} cadence={rotation?.cadence ?? null} />
              </span>
            ) : (
              <>
                {/* A postponement says `PPD` and is not a door: the cell has
                    stopped naming a club at all, and a link under a word that
                    is not the club's name is a link to something the reader did
                    not ask for. */}
                <span className="sched-opp">
                  {ppd ? 'PPD' : <OpponentPress onPress={press} label={opp} />}
                </span>
                {vs && <span className={`sched-vs sched-vs-${vs.tier}`}>{vs.label}</span>}
              </>
            )}
          </span>
        );
      })}
    </>
  );
}

/**
 * A day in the two words this app says it in — `Today` or `Fri`, and `8/15`.
 *
 * **Exported because three surfaces write a day now**: this view's column
 * header, the turn filter's day strip and the `Start` column that filter
 * splices in. `Today` is a fact about the *window's* today rather than about a
 * clock — see `ScheduleIndex.today` — so a tab left open past the 3am rollover
 * cannot come to head one column `Today` and mark another day so in the strip
 * beside it.
 */
export function dayWords(date: string, today: string): { day: string; date: string } {
  const d = new Date(`${date}T12:00:00`);
  return {
    day: date === today ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
    date: `${d.getMonth() + 1}/${d.getDate()}`,
  };
}

/** `Fri` over `8/15`, and `Today` over today's — two lines, so the column is as
 *  narrow as the matchup under it rather than as wide as its own header. */
export function DayHead({ date, today }: { date: string; today: string }) {
  const w = dayWords(date, today);
  return (
    <span className="sched-head">
      <span className="sched-head-day">{w.day}</span>
      <span className="sched-head-date">{w.date}</span>
    </span>
  );
}

/** The count columns' keys, named here so both tables and the sort agree. */
export const SCHED_GAMES_KEY = 'schedGames';
export const SCHED_STARTS_KEY = 'schedStarts';
/** One day column's key — the date, so a span change reuses the columns it can. */
export const schedDayKey = (date: string) => `sched-${date}`;

/**
 * The board's columns, in schedule mode.
 *
 * Built at runtime from the index for exactly the reason `opponentColumn` is
 * built from the statuses map: the array of columns is a *shape*, and the data
 * that fills it arrives when it arrives. Everything else about the board then
 * works untouched — the sort, the count line, the pinned columns, the include
 * buttons, the position pills and the row identity all read `visible`, and the
 * only thing that changed is what is in it.
 *
 * A day column sorts **as text** (`Column.text`), which is the path the
 * opponent column already takes and means "group the board by that day's
 * game"; nulls — the off days — go to the bottom in both directions, exactly as
 * a missing barrel rate does. It is not offered in the filter builder, a
 * threshold on a club abbreviation being nothing anyone can type.
 */
export function scheduleColumns(
  index: ScheduleIndex,
  kind: PlayerKind,
  /** The board's **team** reading, where a row *is* a club. Two things change
   *  and nothing else does: the wording stops saying "his club", and the `GS`
   *  column goes — a turn in the rotation is a fact about a pitcher, and on a
   *  club row `startTally` would count nobody's and print thirty noughts. Every
   *  day cell already works untouched: it was only ever drawn from `r.teamId`,
   *  the player id deciding the start border alone. */
  teams = false,
  /**
   * **What pressing an opponent opens**, or nothing — which is what the board
   * did until now: it built these columns and never handed the cell a door, so
   * `vs MIL` was plain text here while the identical cell on the roster table
   * was a press. One cell, two behaviors, and no reason for it but that the
   * argument was threaded on one side and not the other.
   *
   * Threaded as a parameter rather than read from `PreviewDoorContext` the way
   * the summary table's cell reads it, because a column is not a component: the
   * board builds this array in a `useMemo` where no hook of the cell's can
   * reach, and the door needs the **row** as well as the fixture — the board's
   * row being a `ResearchRow`, which the summary table's context is not typed
   * for and should not be widened to hold. See `ResearchTable::openFixture`.
   *
   * **Absent on the team reading**, and the caller decides that rather than
   * this function: a club row is not a man, and the dialog's two halves are his
   * platoon split and the lineup he faces.
   */
  onPreview?: (row: ResearchRow, game: ScheduleGame) => void,
): Column[] {
  const today = index.today;
  const whose = teams ? 'this club plays' : 'his club plays';
  const games: Column = {
    key: SCHED_GAMES_KEY,
    label: 'G',
    title: `Games ${whose} ${spanPhrase(index)} — postponements excluded`,
    format: (r) => gameCount(index, r.teamId),
    value: (r) => gameCount(index, r.teamId),
    group: 'Schedule',
  };
  const starts: Column = {
    key: SCHED_STARTS_KEY,
    label: 'GS',
    title:
      `Turns he gets ${spanPhrase(index)} — the ones his club has announced, plus the ones ` +
      `his rotation slot puts him in. A cell says which it is made of.`,
    format: (r) => {
      const t = startTally(index, r.teamId, r.id);
      if (t.total === 0) return '—';
      const tier = tallyTier(t) as StartTier;
      // **Two turns is the thing this column exists to say**, and it now says it
      // about a projected pair as well as an announced one — the reason it could
      // not before is measured under `startTally`. The tier is the *weakest* of
      // the turns counted, so a `2` built on a guess is drawn as a guess.
      return (
        <span
          className={`sched-gs sched-gs-${tier}${t.total >= 2 ? ' sched-two' : ''}`}
          title={`${t.total} ${t.total === 1 ? 'turn' : 'turns'} ${spanPhrase(index)} — ${tallyWords(t)}`}
        >
          {t.total}
        </span>
      );
    },
    value: (r) => startTally(index, r.teamId, r.id).total,
  };
  const days: Column[] = index.dates.map((date) => ({
    key: schedDayKey(date),
    label: '',
    // Filled by the header renderer — a day's label is two lines and a
    // `<th>`-worth of markup, which a string column label cannot be. The board
    // reads `headNode` where it has one and `label` where it hasn't.
    headNode: <DayHead date={date} today={today} />,
    title: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }),
    format: (r: ResearchRow) => (
      <ScheduleCell
        index={index}
        teamId={r.teamId}
        playerId={r.id}
        date={date}
        onPreview={onPreview && ((g) => onPreview(r, g))}
      />
    ),
    value: () => null,
    text: (r: ResearchRow) => dayText(index, r.teamId, date),
  }));
  return kind === 'pitcher' && !teams ? [games, starts, ...days] : [games, ...days];
}

/**
 * ---------------------------------------------------------------------------
 * The turn filter — *which pitchers are due to start on these days*
 * ---------------------------------------------------------------------------
 *
 * The research board's own control, and the one question the whole league is
 * the right population for: **who is starting on Friday.** It is how a manager
 * streams a start — pick the days, read the board, and every stat column the
 * picker offers is right there beside the men who are pitching in them.
 *
 * It lives here rather than in `ResearchTable.tsx` because the fact it selects
 * on is this module's: *is he starting that game* is `startTierOn`, one
 * definition, and the filter reads it through an ordinary `ScheduleIndex`
 * (`buildTurnIndex`) rather than through a second structure of its own. See
 * there for why.
 *
 * **It is not the Schedule view and does not turn it on.** That view swaps the
 * stat columns out for the days ahead; this one leaves them exactly where they
 * are and takes *rows* away, which is the half of the board a filter is
 * allowed to touch — the same partition Search and Filters sit on, and the
 * reason those two stay on the bar in schedule mode while Columns and Ranks
 * go. The two compose: a schedule of the men starting this weekend is both
 * controls doing their own half.
 */

/**
 * **How far ahead the filter can be pointed** — a fortnight, which is `Next 14`
 * and is the same fourteen days the Schedule view's own long span draws.
 *
 * The window the server answers with is 28 days and the strip drew all of them
 * first. Two weeks is what a manager plans, the far half of a month of
 * projections is a guess about a rotation that has not happened yet, and 28
 * chips is a strip that scrolls at every width there is where 14 fits outright
 * on a desktop. It is a count of **days the schedule has** rather than of
 * calendar days, exactly as `Next 14` is — see `buildScheduleIndex`.
 */
export const TURN_DAYS = 14;

/**
 * The index the turn filter reads: the next fortnight, off the same builder and
 * the same rules as the Schedule view's own.
 *
 * **It is `buildScheduleIndex` with a span rather than an index of its own**,
 * which is what the second version of this came to. The first built a whole-
 * window index behind a span value (`'window'`) that no control offered and
 * `sched=` could never say — a fourth kind of span invented to describe a run
 * of days that turned out, once the strip was cut to a fortnight, to be exactly
 * the span the app already had a name and a number for. What it needs of the
 * index is what `14` gives it: `byTeam` cut to those days, and `rotations` and
 * `starters` read off the **whole** window regardless, so a pitcher's club is
 * still derived from every game his slot touches.
 *
 * **No matchup**, deliberately: this is not a fantasy week, and a reader whose
 * league runs three-week periods should not be handed a filter that quietly
 * means something different from the one his leaguemate sees.
 */
export function buildTurnIndex(
  win: ScheduleWindow,
  pitchers: PitcherLookup | null = null,
): ScheduleIndex {
  return buildScheduleIndex(win, TURN_DAYS, null, pitchers);
}

/**
 * The days picked — **a set, not a range**, held sorted and never empty (the
 * filter is off instead).
 *
 * It was a range for one commit, two presses picking the ends and everything
 * between them coming with them. That is the shape a *calendar* has and the
 * wrong one for this control: the question is which days you can start
 * somebody, and *Monday and Thursday* — a two-start week around an off day, or
 * the two days of a fantasy week you have a slot free — is not a run of days
 * with the middle swept in. Ends were also a mode the strip had to be in and
 * had to say it was in (`Press another day for a range`), where a toggle is
 * one rule that never needs explaining.
 */
export type TurnDays = readonly string[];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Every calendar day from `a` to `b` inclusive, for the `..` form below. */
function daysBetween(a: string, b: string): string[] {
  const out: string[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * `turn=2026-08-24,2026-08-27` — the days, comma-separated; and a run of them
 * may be written `2026-08-24..2026-08-26`, which is what `turnDaysParam`
 * writes and what a link shared before this was a set still says. Anything
 * unreadable — including absence — is off.
 *
 * **`turn=` rather than `starts=`, and the reason is the param an inch away.**
 * The date bar writes `start=` and `end=`, and a query string carrying
 * `start=2026-08-20&starts=2026-08-28` is two params that mean two different
 * things and *look* like one typed twice — the app's own "two params must never
 * mean two things" trap, read at the level of the eye rather than the parser. A
 * turn is what this app has called a start since the `GS` column was written
 * ("the turns his rotation slot puts him in"), so the vocabulary was already
 * there.
 *
 * **A run that arrives backwards is read forwards** rather than dropped, and a
 * day that appears twice appears once, both being the falls-back-rather-than-
 * empties rule applied to the malformations that have an obvious reading. A
 * *part* that cannot be read at all takes the whole param with it: half a set
 * of days is a filter the reader never asked for.
 */
export function toTurnDays(v: string | null): string[] | null {
  if (!v) return null;
  const days = new Set<string>();
  for (const part of v.split(',')) {
    const [a, b = a] = part.split('..');
    if (!ISO_DAY.test(a) || !ISO_DAY.test(b)) return null;
    for (const d of a <= b ? daysBetween(a, b) : daysBetween(b, a)) days.add(d);
  }
  return days.size > 0 ? [...days].sort() : null;
}

/** …and back, with consecutive days folded into a `a..b` run. A fortnight
 *  picked one chip at a time is then eleven characters in the query string
 *  rather than a hundred and sixty, and the two forms round-trip. */
export function turnDaysParam(days: TurnDays): string {
  const parts: string[] = [];
  for (let i = 0; i < days.length; i += 1) {
    const from = days[i];
    while (i + 1 < days.length && days[i + 1] === addDays(days[i], 1)) i += 1;
    parts.push(from === days[i] ? from : `${from}..${days[i]}`);
  }
  return parts.join(',');
}

/**
 * The days cut to the ones this index actually holds, or **null where none of
 * them survive**.
 *
 * A link is shared on Tuesday and opened on Friday, and the days it names may
 * by then be behind the window's first — the schedule this app reads runs
 * **ahead of today** and never a day back — or past the fortnight the strip
 * offers. A filter selecting on days the board can say nothing about is one
 * that empties it in silence, which is the one thing an unrecognized value must
 * not do; so what is left is kept and the rest goes, and the strip then marks
 * exactly the days in force. It is also what drops an **off day** a `..` run
 * swept up: the index holds the days the schedule has, and a day nobody plays
 * is not one of them.
 *
 * Returns the array it was handed where nothing changed, so a settling pass
 * costs no render.
 */
export function clampTurnDays(days: TurnDays, index: ScheduleIndex): string[] | null {
  const held = new Set(index.dates);
  const kept = days.filter((d) => held.has(d));
  if (kept.length === 0) return null;
  return kept.length === days.length ? (days as string[]) : kept;
}

/** One turn as the filter reads it — the day, the game it is, and how sure. */
export interface Turn {
  date: string;
  game: ScheduleGame;
  tier: StartTier;
}

/**
 * The turns he is due on the days picked, soonest first.
 *
 * **`startTierOn` per game, which is the `GS` column's own test** — so a man
 * the filter lets through on Friday is a man the grid draws a box round on
 * Friday, and neither can say the other is wrong. A postponement is not a turn,
 * exactly as it is not a game in `gameCount`.
 */
export function turnsOnDays(
  index: ScheduleIndex,
  teamId: number | null,
  playerId: number,
  days: ReadonlySet<string>,
): Turn[] {
  if (teamId === null) return [];
  const out: Turn[] = [];
  for (const date of index.dates) {
    if (!days.has(date)) continue;
    for (const g of gamesOn(index, teamId, date)) {
      if (g.state === 'postponed') continue;
      const tier = startTierOn(index, g, teamId, playerId);
      if (tier) out.push({ date, game: g, tier });
    }
  }
  return out;
}

/** `Fri 8/28`, or `Today 8/24` on the day the window opens on — a day in the
 *  strip, in the chip, and in the column, written once. */
export function turnDayLabel(date: string, today: string): string {
  const w = dayWords(date, today);
  return `${w.day} ${w.date}`;
}

/**
 * What the chip says the board is cut to.
 *
 * **Runs are named as runs and scattered days as themselves** — `Fri 8/28 – Sun
 * 8/30`, `Mon 8/24 · Thu 8/27` — because that is how the reader picked them and
 * a set of three that happens to be consecutive is a weekend rather than three
 * facts. Past **three** groups it gives up and counts: `6 days` is shorter than
 * the run of dates and no less true, the strip a line above being where which
 * days is actually read off. The full list is always on the chip's own title.
 */
export function turnDaysLabel(days: TurnDays, today: string): string {
  const groups: string[] = [];
  for (let i = 0; i < days.length; i += 1) {
    const from = days[i];
    while (i + 1 < days.length && days[i + 1] === addDays(days[i], 1)) i += 1;
    groups.push(
      from === days[i]
        ? turnDayLabel(from, today)
        : `${turnDayLabel(from, today)} – ${turnDayLabel(days[i], today)}`,
    );
    if (groups.length > 3) return `${days.length} days`;
  }
  return groups.join(' · ');
}

/** Every day picked, spelled out — the chip's title, and what the label above
 *  gives up when it counts instead. */
export function turnDaysTitle(days: TurnDays, today: string): string {
  return days.map((d) => turnDayLabel(d, today)).join(' · ');
}

/** The column's key, named here so the board and the sort agree — the shape
 *  `SCHED_GAMES_KEY` and `SCHED_STARTS_KEY` already take. */
export const TURN_KEY = 'turnDay';

/**
 * **`Start` — the day he is due, spliced in while the filter is on.**
 *
 * A filtered row has to say *why it is on screen*, which is the argument the
 * position cell already makes on this board for printing the whole eligibility
 * list rather than two codes and a `+3`. `Starting Fri – Sun` narrows six
 * hundred pitchers to forty and then says nothing about which of the three days
 * any of them is pitching on, which is the half of the answer a manager is
 * actually choosing between.
 *
 * So the column is **the filter's own**, present exactly while it is and absent
 * otherwise: it is not in `allColumns`, the picker never offers it and no
 * threshold can be typed against it — a day is not a number a reader can hold
 * an opinion about, which is the same reason the opponent column is `text` and
 * out of the builder. In schedule mode it is not spliced at all: the day
 * columns *are* this fact, drawn 14 wide.
 *
 * **The opponent rides with it**, because the day is half of a streaming
 * decision and the club is the other half — `Fri 8/28 @ ATL`. It is plain text
 * where the grid's own cell is a door onto the game preview, and deliberately:
 * that cell is the *fixture*, drawn under a header naming the day, where this
 * one is a caption on a start. The Schedule view is one press away and every
 * fixture in it opens.
 *
 * **The three tiers are the app's ladder and they travel as modifiers**, the
 * way the player page's Schedule tab takes them: upright where his club has
 * named him, italic where it is our reading of his own slot, italic under a
 * dashed line where it is his club's rotation standing in. Nothing new is
 * declared for them here.
 */
export function turnColumn(
  index: ScheduleIndex,
  days: ReadonlySet<string>,
  /**
   * **What pressing a start opens** — the same two doors the roster table's
   * opponent cell chooses between, and for the same reason: *what is this game*
   * before it is played, *how did it go* after.
   *
   * Absent leaves the line the plain text it was, which is the rule
   * `OpponentPress` keeps for every cell with nothing behind it.
   */
  doors?: {
    /** A fixture nobody has played — the preview dialog. */
    preview?: (row: ResearchRow, game: ScheduleGame) => void;
    /** One already under way or finished — the game's own page. */
    game?: (gamePk: number) => void;
  },
): Column {
  /** Where each day sits in the window, for the sort — an ordinal rather than a
   *  date string, so the column orders soonest-first through a `value` like
   *  every other numeric column rather than through the `text` path. */
  const ordinal = new Map(index.dates.map((d, i) => [d, i]));
  /**
   * His turns, worked once per row rather than once per read of the column.
   *
   * The sort asks `value` twice per comparison — 750 rows is ~19 comparisons
   * each — and the formatter asks for the same list again, so the naive shape
   * is a 28-day scan run forty times per pitcher on every sort. The cache is
   * scoped to this column object, which is rebuilt whenever the index or the
   * range moves, so it can never answer for a range that is no longer in force.
   */
  const cache = new Map<number, Turn[]>();
  const turns = (r: ResearchRow): Turn[] => {
    let t = cache.get(r.id);
    if (!t) cache.set(r.id, (t = turnsOnDays(index, r.teamId, r.id, days)));
    return t;
  };
  return {
    key: TURN_KEY,
    label: 'Start',
    group: 'Schedule',
    title:
      'The day he is due to start on the days you picked, and who against — ' +
      'upright where his club has announced him, italic where it is his rotation slot',
    // Soonest first: the reader picked these days to find somebody to start,
    // and the nearest turn is the one there is least still to go wrong with.
    ascFirst: true,
    format: (r) => {
      const list = turns(r);
      if (list.length === 0) return '—';
      return (
        <span className="research-turn-cell">
          {list.map((t) => {
            const played = t.game.state === 'live' || t.game.state === 'final';
            // **The opponent is the door, and the day carries the caveat** —
            // which is the grid's own division of one cell into two marks, and
            // here it is forced as well as consistent: a door wears a dotted
            // underline and an *estimated* turn wears a dashed one, and a
            // descendant cannot cancel an ancestor's decoration — so the two on
            // one run of text is two underlines a pixel apart. Each mark on its
            // own segment says one thing each, and marking the **day** is the
            // honest half anyway: the club plays that day whatever happens, and
            // what is being guessed is that he is the one starting.
            const press = played
              ? doors?.game && (() => doors.game!(t.game.gamePk))
              : doors?.preview && (() => doors.preview!(r, t.game));
            const day = turnDayLabel(t.date, index.today);
            const opp = opponentText(t.game, r.teamId as number);
            return (
              <span
                key={t.game.gamePk}
                className={`research-turn${t.tier === 'announced' ? '' : ' research-turn-guess'}`}
                title={press ? undefined : `${day} — ${TIER_TITLE[t.tier]}`}
              >
                <span
                  className={`research-turn-day${
                    t.tier === 'estimated' ? ' research-turn-est' : ''
                  }`}
                >
                  {day}
                </span>
                <span className="research-turn-opp">
                  {' '}
                  <OpponentPress
                    onPress={press ?? null}
                    label={opp}
                    opens={played ? 'page' : 'dialog'}
                    title={`${day} ${opp} — ${TIER_TITLE[t.tier]}${
                      press ? ` — open the ${played ? 'game' : 'matchup'}` : ''
                    }`}
                  />
                </span>
              </span>
            );
          })}
        </span>
      );
    },
    value: (r) => {
      const first = turns(r)[0];
      return first ? (ordinal.get(first.date) ?? null) : null;
    },
  };
}

/**
 * How many of these rows are due a turn on each day of the window — the number
 * under every chip in the strip.
 *
 * **Counted over the board the reader has already narrowed**, not over the
 * league: `12` under Friday on a board of free-agent starters is the number of
 * rows that press will leave, which is the only reading of it that can be acted
 * on. A day nobody on the board starts is `0` and is still pressable — the
 * board then says so in words and names this control, which is what an empty
 * state owes; a disabled chip would leave the reader to work out that the
 * board, and not the schedule, is what has no starter on Thursday.
 *
 * **A doubleheader is one day, not two.** The count is of *rows*, so a man who
 * would somehow be due both ends of one is counted once — where `startTally`,
 * counting turns, counts two.
 */
export function turnCounts(index: ScheduleIndex, rows: ResearchRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.teamId === null) continue;
    const days = index.byTeam.get(r.teamId);
    if (!days) continue;
    for (const [date, games] of days) {
      for (const g of games) {
        if (g.state === 'postponed') continue;
        if (!startTierOn(index, g, r.teamId, r.id)) continue;
        out.set(date, (out.get(date) ?? 0) + 1);
        break;
      }
    }
  }
  return out;
}
