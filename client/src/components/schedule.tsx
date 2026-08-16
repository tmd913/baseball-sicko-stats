import type { ReactNode } from 'react';
import type { Column } from './researchColumns';
import type {
  MatchupWindow,
  PlayerKind,
  ResearchRow,
  ScheduleGame,
  ScheduleWindow,
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
/** The two that need no league. Kept as its own list because it is what the
 *  control offers when there isn't one — the named pair is spliced in front. */
export const SCHEDULE_SPANS: ScheduleSpan[] = [7, 14];

/** `sched=7` / `sched=14` / `sched=matchup` / `sched=next`; anything else
 *  (including absence) is off. A named span on a page with no league resolves
 *  to `7` when it is *drawn* rather than being dropped here — see
 *  `effectiveSpan`, and the rule `cols=` follows: a link says what it meant
 *  even where this reader cannot honour it yet. */
export function toScheduleSpan(v: string | null): ScheduleSpan | null {
  return v === '7' ? 7 : v === '14' ? 14 : v === 'matchup' ? 'matchup' : v === 'next' ? 'next' : null;
}

/** Which spans this reader can actually be offered, in reading order: the
 *  matchup pair leads where there is a league to define it, since that is the
 *  question the view is opened with and the one the mode now defaults to. */
export function scheduleSpans(matchup: MatchupWindow | null): ScheduleSpan[] {
  if (!matchup) return SCHEDULE_SPANS;
  return matchup.next
    ? ['matchup', 'next', ...SCHEDULE_SPANS]
    : ['matchup', ...SCHEDULE_SPANS];
}

/** What the mode opens on. **This matchup where there is one**, which is the
 *  fantasy week the reader is in; seven days otherwise. */
export function defaultScheduleSpan(matchup: MatchupWindow | null): ScheduleSpan {
  return matchup ? 'matchup' : 7;
}

/** The span actually in force — a named one asked for by a link or by a league
 *  that has since gone falls back to seven days rather than drawing nothing. */
export function effectiveSpan(
  span: ScheduleSpan,
  matchup: MatchupWindow | null,
): ScheduleSpan {
  if (span === 'matchup' && !matchup) return 7;
  if (span === 'next' && !matchup?.next) return 7;
  return span;
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

export function spanLabel(span: ScheduleSpan, matchup: MatchupWindow | null): SpanLabel {
  const range = (from: string, to: string) => `${shortDate(from)} – ${shortDate(to)}`;
  if (span === 'matchup' && matchup) {
    return {
      label: 'This Matchup',
      // The period's own dates rather than the days drawn: the columns start
      // today, and what the reader is being told is which fantasy week this is.
      title: `The rest of matchup period ${matchup.period} — ${range(matchup.start, matchup.end)}`,
    };
  }
  if (span === 'next' && matchup?.next) {
    return {
      label: 'Next Matchup',
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
}

export function buildScheduleIndex(
  win: ScheduleWindow,
  span: ScheduleSpan,
  matchup: MatchupWindow | null = null,
): ScheduleIndex {
  // The dates are taken from the games rather than generated from `start`, so
  // the columns are the days the server actually answered for — a short window
  // (a season ending inside it) then draws the days it has instead of a run of
  // empty columns claiming the schedule has run out.
  const all = [...new Set(win.games.map((g) => g.date))].sort();
  // A **named** span is a date range and a numeric one is a count of days, and
  // the difference is the whole of what a matchup span is: `Next 7` is the
  // first seven days with games, where `This Matchup` is every day up to the
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
  return { span: eff, dates, today: win.start, short: wants !== null && wants > win.end, byTeam };
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

/** Is this the game his club has **announced** him to start? */
function startsIt(g: ScheduleGame, teamId: number, playerId: number): boolean {
  return (g.homeId === teamId ? g.homeProbableId : g.awayProbableId) === playerId;
}

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

/**
 * Starts his club has **announced** for him in the span, which is the two-start
 * marker and is deliberately not a projection.
 *
 * Clubs name a probable about three days out — measured on the live 2026
 * season: 28/28 slots filled today, 27/30 tomorrow, 30/30 at two days, then
 * **3/22 at three, 1/30 at four and none at all beyond**. So over a week this
 * counts the announced front of it and reads 1 for most starters, and a 2 is a
 * fact rather than an inference. Projecting the rest off a rotation slot is the
 * thing the feed's Upcoming section already refuses to do — *"an announcement
 * is the only thing that puts him there"* — and for the same measured reason:
 * four starters in five are not pitching, so a guess is right about one of them
 * and states the other four as facts.
 */
export function startCount(
  index: ScheduleIndex,
  teamId: number | null,
  playerId: number,
): number {
  if (teamId === null) return 0;
  const days = index.byTeam.get(teamId);
  if (!days) return 0;
  let n = 0;
  for (const list of days.values()) {
    for (const g of list) if (g.state !== 'postponed' && startsIt(g, teamId, playerId)) n += 1;
  }
  return n;
}

/** `@ LAD` / `vs SEA` — what a cell says, and what its column sorts on. */
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

/**
 * One day's cell.
 *
 * The `<td>` belongs to whichever table is drawing — the board owns its own,
 * the summary table its own — so everything this needs to say it says on a
 * `<span>` of its own. That is what lets one function serve both without either
 * table needing a `cellClass` rule for the other's sake.
 *
 * Three things are drawn and each is a state rather than a value, which is the
 * only thing these tables spend colour on: a **live** game's opponent takes the
 * accent green the summary table's own opponent cell gives a live inning, a
 * **postponement** reads `PPD` in the same amber that cell uses, and a game
 * already **final** goes muted, so today's column says at a glance which of its
 * games are still to come. An off day is a faint dash — quiet on purpose, so a
 * row's games are what the eye lands on when it scans across.
 */
export function ScheduleCell({
  index,
  teamId,
  playerId,
  date,
}: {
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
  // A doubleheader draws both matchups stacked; they are almost always the same
  // opponent, and saying so twice is cheaper than a "×2" the reader has to
  // decode — and where a club splits a day between two clubs it is the truth.
  return (
    <>
      {games.map((g) => {
        const start = teamId !== null && startsIt(g, teamId, playerId);
        const ppd = g.state === 'postponed';
        return (
          <span
            key={g.gamePk}
            className={`sched-cell sched-${g.state}${start ? ' sched-start' : ''}`}
            title={
              ppd
                ? `${opponentText(g, teamId as number)} — postponed`
                : `${opponentText(g, teamId as number)}${
                    start ? ' — his club has announced him to start' : ''
                  }`
            }
          >
            <span className="sched-opp">{ppd ? 'PPD' : opponentText(g, teamId as number)}</span>
            {start && !ppd && <span className="sched-sp">SP</span>}
          </span>
        );
      })}
    </>
  );
}

/** `Fri` over `8/15`, and `Today` over today's — two lines, so the column is as
 *  narrow as the matchup under it rather than as wide as its own header. */
export function DayHead({ date, today }: { date: string; today: string }) {
  const d = new Date(`${date}T12:00:00`);
  return (
    <span className="sched-head">
      <span className="sched-head-day">
        {date === today ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}
      </span>
      <span className="sched-head-date">{`${d.getMonth() + 1}/${d.getDate()}`}</span>
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
export function scheduleColumns(index: ScheduleIndex, kind: PlayerKind): Column[] {
  const today = index.today;
  const games: Column = {
    key: SCHED_GAMES_KEY,
    label: 'G',
    title: `Games his club plays ${spanPhrase(index)} — postponements excluded`,
    format: (r) => gameCount(index, r.teamId),
    value: (r) => gameCount(index, r.teamId),
    group: 'Schedule',
  };
  const starts: Column = {
    key: SCHED_STARTS_KEY,
    label: 'GS',
    title: `Starts his club has announced ${spanPhrase(index)} — clubs name a probable about three days out, so this counts the announced front of the span`,
    format: (r) => {
      const n = startCount(index, r.teamId, r.id);
      return n === 0 ? '—' : <span className={n >= 2 ? 'sched-two' : undefined}>{n}</span>;
    },
    value: (r) => startCount(index, r.teamId, r.id),
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
      <ScheduleCell index={index} teamId={r.teamId} playerId={r.id} date={date} />
    ),
    value: () => null,
    text: (r: ResearchRow) => dayText(index, r.teamId, date),
  }));
  return kind === 'pitcher' ? [games, starts, ...days] : [games, ...days];
}
