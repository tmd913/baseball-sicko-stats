import type { ReactNode } from 'react';
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
 *  even where this reader cannot honour it. */
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
 * `This Matchup · Next 7 · Next 14` and the reader keeps somewhere to go.
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
 * league names both its weeks now falls back to `This Matchup` exactly as a
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
  return {
    span: eff,
    dates,
    today: win.start,
    short: wants !== null && wants > win.end,
    byTeam,
    rotations,
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

/** `SP` / `SP` outlined / `SP` dashed — the chip, and the class that grades it. */
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
 * only thing these tables spend colour on: a **live** game's opponent takes the
 * accent green the summary table's own opponent cell gives a live inning, a
 * **postponement** reads `PPD` in the same amber that cell uses, and a game
 * already **final** goes muted, so today's column says at a glance which of its
 * games are still to come. An off day is a faint dash — quiet on purpose, so a
 * row's games are what the eye lands on when it scans across.
 *
 * **A starting pitcher's own game carries an `SP` chip, in one of three
 * weights** — filled where his club has named him, outlined where his own
 * rotation slot puts him there, dashed where his club's rotation does. That is
 * the app's own ladder for how sure a number is (the percentile card's dotted
 * bubble, the Splits card's hatched fill), applied to a grid cell where a word
 * would not fit; the sentence is on the chip's own title.
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
        return (
          <span
            key={g.gamePk}
            className={`sched-cell sched-${g.state}${tier ? ` sched-start sched-start-${tier}` : ''}`}
            title={ppd ? `${opp} — postponed` : tier ? `${opp} — ${TIER_TITLE[tier]}` : opp}
          >
            <span className="sched-opp">{ppd ? 'PPD' : opp}</span>
            {tier && <StartChip tier={tier} cadence={rotation?.cadence ?? null} />}
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
      <ScheduleCell index={index} teamId={r.teamId} playerId={r.id} date={date} />
    ),
    value: () => null,
    text: (r: ResearchRow) => dayText(index, r.teamId, date),
  }));
  return kind === 'pitcher' ? [games, starts, ...days] : [games, ...days];
}
