/**
 * **The Overview — the app's front page, and the one that answers the question
 * a manager actually opens the app with.**
 *
 * Every other view in this app is a *reading*: the Roster is your players over
 * a range you choose, the Feed is those same players' day as a stream, Research
 * is the whole league's season, and the League page is the fantasy league's own
 * three questions. All four are excellent once you know what you are looking
 * for. None of them answers *how is it going* — which is the question somebody
 * opening this on a phone at nine in the morning, or at ten at night with two
 * games left, is actually asking, and which used to take three presses and a
 * date change to assemble by hand.
 *
 * So this is four blocks and no controls:
 *
 * 1. **Your matchup** — the scoreboard card for the week you are in, drawn by
 *    `LeagueView`'s own `MatchupCard` rather than by a second copy of it, so
 *    the categories, the colors and the headline triple here and on the League
 *    page cannot come to disagree. Pressing it opens the same matchup page the
 *    Scoreboard's cards open.
 * 2. **Today**, 3. **Yesterday**, 4. **Tomorrow** — a day block each, in the
 *    order a manager asks after them rather than in calendar order: *what is
 *    happening*, *what happened*, *what is coming*. Each names its own days,
 *    prints the day's totals **in the league's own categories**, and lists the
 *    three men who did most for them.
 *
 * **The day blocks print categories rather than a stat line**, which is the
 * decision the rest of the page hangs off. A generic `12 H · 2 HR · 6 RBI` is a
 * fact about baseball; `R 6 · HR 2 · RBI 6 · SB 1 · OPS .812` is a fact about
 * *the matchup above it*, in the same ten columns, so the eye carries straight
 * from the week's figure to the day that moved it. A reader with no league
 * connected gets the standard 5×5 and a block that says so — see
 * `categoryValue.ts::STANDARD_5X5`.
 *
 * **And the totals are the lineup's, not the roster's.** ESPN banks a man only
 * on the scoring periods he held a starting slot for, so counting the bench
 * would print a day that reads higher than the scoreboard directly above it —
 * the same fault, and the same fix, that `LeagueTeam`'s Summary reading records
 * (`lib.ts::projectStarters`, which cuts *days* rather than rows). The head
 * says `Lineup · 20 of 29` so the reading is never a guess.
 *
 * See `docs/claude/client-overview.md`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  EspnCategory,
  EspnScoreboard,
  EspnStandingsTeam,
  PlayerKind,
  PlayerReport,
  RosterProjection,
  SeasonPlayer,
  TrendWindow,
} from '../types';
import { playerKey } from '../types';
import { categoryTotal, dayValue, STANDARD_5X5 } from '../categoryValue';
import type { DayLine } from '../categoryValue';
import {
  combineLines,
  combinePitchingLines,
  formatIp,
  headshotUrl,
  lineSummary,
  possessive,
  prettyDate,
  prettyGameDate,
  surname,
} from '../lib';
// The board's own two, imported rather than written again: the trending cards
// print the same fact its `Δ` columns do, and one presentation of a signed move
// is one place for it to be decided.
import { formatTrend, trendDirection } from './researchColumns';
import { LoadingBlock } from './Loading';
import { Modal } from './Modal';
import { useDelayedFlag } from '../hooks';
import { useOverflowArrows } from './TabStrip';
import { MatchupCard, categoryGroups, fmtValue } from './LeagueView';
import { ProjectedGlyph } from './Projection';

/** How many men a day block names. Three, and the number is the block's own
 *  height rather than a taste: a day card carries a head, two category rows and
 *  a list, and three rows is what fits beside the other two blocks at 1200
 *  without either the card or the page scrolling. A fourth is one press away —
 *  the whole roster's day is the Roster view with the date set to that day,
 *  which is where the `See the day →` foot goes. */
const TOP_N = 3;

/**
 * **The days the row draws, in the order they happened — and it is the whole
 * matchup period now, not three days of it.**
 *
 * They were drawn `Today · Yesterday · Tomorrow` — the order a manager *asks*
 * after them — and that reads as a list where the row is a **carousel**, whose
 * whole grammar is that left is back and right is forward. Chronological is
 * what a swipe means, and it costs nothing: the row still opens on `Today`, so
 * what leads is unchanged and what has moved is where the other days are.
 *
 * **What has changed is how many of them there are.** Three days is the shape a
 * manager *asks* after; it is not the shape of the thing they are days of. The
 * card at the top of this page scores a **period**, and a row that stopped at
 * tomorrow could not answer *what did Saturday come to* or *what is Thursday
 * worth* about the very week that card is a total of — which left the reader
 * setting the date bar by hand on another view, the exact errand this page
 * exists to spare them.
 *
 * So the row is the period's own `start … end`, a card a day, and the three
 * named days are wherever they happen to fall in it. **A reader with no league
 * keeps exactly the three there always were**, which is not a special case but
 * the same rule read at its other end: a period is a thing a league has, and
 * without one there is no span to draw. `App.tsx::overviewDays` is where the
 * list is derived and where that fallback lives.
 */

/** Whole days from `a` to `b`, both `YYYY-MM-DD`. In UTC, for `addDays`'s own
 *  reason — no DST boundary may round a date the wrong way. */
function daysApart(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * **What a card calls its day.**
 *
 * The three named days keep their words, those being what a manager asks after,
 * and the rest of the period counts from today. Counting rather than naming the
 * weekday is the reading a row you *swipe* wants: `3 DAYS AGO` says where in
 * the week you have got to, where `WED` makes the reader work that out against
 * a date on the line below — and the date is on that line either way, so the
 * weekday would have been the one fact said twice.
 */
function dayWord(date: string, today: string): string {
  const n = daysApart(today, date);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n === 1) return 'Tomorrow';
  return n < 0 ? `${-n} days ago` : `In ${n} days`;
}

/** An empty batting line, for a pitcher's row reaching the batter's summary —
 *  which cannot happen and is what the fallback is for. Its own constant rather
 *  than a `combineLines([])` allocated on every render that takes the branch. */
const NO_BATTING = combineLines([]);

/* ---- One player's day ---------------------------------------------------- */

/** A man, his day, and what it was worth — the row a top-performer list draws
 *  and the unit both the played blocks and the projected one are built from. */
interface Performer {
  key: string;
  id: number;
  name: string;
  kind: 'batter' | 'pitcher';
  line: DayLine;
  /** In per-day standard deviations across the league's categories on his side
   *  of the ball. Null where the league scores nothing computable on it. */
  value: number | null;
}

/**
 * **What a report's games on one day come to**, as the two lines and the two
 * appearance counts `dayValue` and `categoryTotal` both read.
 *
 * `g.pitching` is a whole `PitcherGame` and the line is `g.pitching.line` — the
 * one join in this file it is possible to get wrong silently, since a
 * `PitcherGame` has no `outs` and every figure downstream would have come out
 * `NaN` rather than zero.
 *
 * **A game that has not started is not in the count.** `games` is what a league
 * scoring `GP` would read and a scheduled fixture is not an appearance; a live
 * one is, which is the whole point of a block called *Today*.
 */
function lineOf(report: PlayerReport, date: string): DayLine {
  const games = report.games.filter((g) => g.date === date);
  const played = games.filter((g) => g.status.state === 'final' || g.status.state === 'live');
  return {
    batting: report.kind === 'pitcher' ? null : combineLines(games.map((g) => g.line)),
    pitching:
      report.kind === 'pitcher'
        ? combinePitchingLines(games.map((g) => g.pitching?.line).filter((l) => l != null))
        : null,
    games: played.length,
    starts: played.filter((g) => g.pitchingRole === 'starting').length,
  };
}

/** The two lines of a day, added. The blocks' own totals are this over every
 *  man in the lineup, which is what makes the foot row the same arithmetic as
 *  the rows above it. */
function addLines(lines: DayLine[]): DayLine {
  return {
    batting: combineLines(lines.map((l) => l.batting).filter((l) => l != null)),
    pitching: combinePitchingLines(lines.map((l) => l.pitching).filter((l) => l != null)),
    games: lines.reduce((n, l) => n + l.games, 0),
    starts: lines.reduce((n, l) => n + l.starts, 0),
  };
}

/** Did this day put anything on the board at all? What the empty state below
 *  each block is gated on — and it asks the *line* rather than the game count,
 *  because a lineup of men whose clubs were all idle is a real day with nothing
 *  in it and reads the same either way. */
function anyPlay(line: DayLine): boolean {
  return (line.batting?.pa ?? 0) > 0 || (line.pitching?.battersFaced ?? 0) > 0;
}

/**
 * **A pitcher's day, in the order a pitching line is written**: `IP, H, R, ER,
 * K, BB`, then his decision.
 *
 * It was `IP, K, ER, H, BB` — the categories first and the line's own order
 * nowhere — which is the same mistake the row above it makes on purpose and
 * this one has no reason to. A **played** day is a result, and a result has a
 * form every reader of a box score already knows; a manager reading
 * `6.0 IP, 3 H, 0 R, 0 ER, 2 BB, 7 K` is not decoding it. The *projected* row
 * is where the categories belong, and it has them (below).
 *
 * **Every term, including the noughts**, which reverses the note this function
 * used to carry about dropping a term at zero. That rule is right for a
 * *phrase* and wrong for a *line*: `0 R, 0 ER` is the whole story of a
 * shutout, and a line that silently omitted them would leave the reader
 * counting commas to work out which figure was missing. The decision is the one
 * thing still conditional, there being no such thing as a nought decision.
 *
 * **`R` as well as `ER`**, which the old phrase had no room for and a line must
 * have: they differ exactly where an error has come into it, and that is a
 * difference a manager is entitled to see rather than a rounding of it.
 *
 * A **loss** is the one decision that cannot be drawn: `PitchingLine` carries
 * `wins`, `saves` and `holds` and no losses — the boxscore credit this app
 * stores has never included them. Nothing is invented in its place.
 */
function pitchSummary(line: DayLine): string {
  const p = line.pitching;
  if (!p) return '—';
  const parts = [
    `${formatIp(p.outs)} IP`,
    `${p.hits} H`,
    `${p.runs} R`,
    `${p.earnedRuns} ER`,
    `${p.strikeouts} K`,
    `${p.walks} BB`,
  ];
  if (p.wins) parts.push('W');
  if (p.saves) parts.push('SV');
  if (p.holds) parts.push('HD');
  return parts.join(', ');
}

/**
 * **A projected line is the league's own categories, in the order the card
 * above it prints them.**
 *
 * It was a fixed phrase — `4.4 PA, 0.9 H, 0.7 R, 0.6 RBI` for a batter,
 * `5.3 IP, 5.5 K, 1.7 ER` for a pitcher — chosen for readability and answering
 * a question nobody on this page is asking. **Plate appearances are not a
 * category**, and neither are hits in a league that scores OPS. The block is
 * headed by five columns; the row under it should be those five figures for
 * this man, so the eye carries from `HR 1.7` on the team's line to the `0.2 HR`
 * that is his share of it.
 *
 * **`categoryGroups` gives both the set and the order**, which is the same
 * function the block's own header row is drawn from — so the row and the
 * columns above it cannot come to disagree about which five, or in what order,
 * and a league scoring something else gets its own five here for free.
 *
 * **A count keeps one decimal and a rate is formatted as itself.** `fmtValue`
 * is right about the rates — an OPS is `.797` and an ERA is `3.76`, which is
 * the whole reason it exists — and wrong about a projected count, where it
 * would print `0.943` off a figure that is an expectation to a tenth at best.
 * A category the line cannot produce is a dash rather than a nought: a man with
 * no plate appearance projected has no OPS, and `.000` would be a claim.
 */
/**
 * **Starter or reliever, as the projection itself says it.**
 *
 * A projected pitcher can earn one decision or the other and never both, so a
 * line offering him `0.4 W` *and* `0.0 SVHD` is spending a term on a category
 * he is not in. Which one he is in is not a fact this file has to guess at —
 * the engine has already answered it, in the credits it projected.
 *
 * **The credits lead, innings break the tie.** A man with more saves and holds
 * coming than wins is out of the bullpen; equal (which in practice means both
 * nought) is settled by whether the outs look like a turn. Nine — three
 * innings — is the line, and it is the case that made the tie-break necessary
 * rather than a default: measured on the live league, Walbert Ureña projects
 * `5.3 IP · 0.40 W · 0.00 SVHD` and is a starter on the credits alone, but Ian
 * Seymour projects `3.1 IP · 0.00 W · 0.00 SVHD` — a starter with no credit
 * either way, whom a bare `wins >= svhd` test would have called a starter by
 * accident and a `wins > svhd` test would have called a reliever outright. His
 * innings are what say it.
 *
 * Checked over both rosters' pitchers on one read: six relievers at 0.3–0.5 IP
 * all called relievers, the two men with a turn both called starters, and
 * Adrian Morejon — `0.5 IP · 0.10 W · 0.20 SVHD`, credits on both sides —
 * called a reliever by the larger of the two.
 */
function projectedRole(line: DayLine): 'starter' | 'reliever' {
  const p = line.pitching;
  if (!p) return 'reliever';
  if (p.saves + p.holds > p.wins) return 'reliever';
  return p.outs >= 9 ? 'starter' : 'reliever';
}

/** The decision categories, by which role can earn one. A league scoring `SV`
 *  and `HD` separately is covered by the same two sets, which is why they are
 *  sets of ids rather than a test on `SVHD`. */
const STARTER_DECISIONS = new Set([53, 54]); // W, L
const RELIEF_DECISIONS = new Set([56, 57, 58, 59, 60, 83]); // SVO, SV, BS, SV%, HD, SVHD

function projSummary(
  kind: 'batter' | 'pitcher',
  line: DayLine,
  categories: EspnCategory[],
): string {
  const side = kind === 'pitcher' ? 'pitching' : 'batting';
  const group = categoryGroups(categories).find((g) => g.side === side);
  if (!group || group.categories.length === 0) return '—';
  // **One decision, not both.** The categories he cannot earn are dropped
  // rather than printed at nought — see `projectedRole`. The rest keep the
  // block's own order, so what is left still reads against the header above it.
  const relief = side === 'pitching' && projectedRole(line) === 'reliever';
  const starter = side === 'pitching' && !relief;
  return group.categories
    .filter(
      (c) =>
        !(relief && STARTER_DECISIONS.has(c.statId)) &&
        !(starter && RELIEF_DECISIONS.has(c.statId)),
    )
    .map((c) => {
      const v = categoryTotal(c, line);
      if (v === null || !Number.isFinite(v)) return `— ${c.label}`;
      return `${c.format === 'count' ? v.toFixed(1) : fmtValue(v, c)} ${c.label}`;
    })
    .join(', ');
}

/* ---- The day block ------------------------------------------------------- */

/**
 * **The league's own categories, as two labeled blocks** — the same
 * `categoryGroups` split the scoreboard card and the Rankings table read, so a
 * day's `SVHD` sits under `PITCHERS` here for the same reason and by the same
 * function it does an inch above. Ten columns in one run overflowed a 390px
 * phone by 118px on the card that first drew them (see
 * `docs/claude/client-league.md`); five per block is what fits, and the reading
 * a manager wants — his bats and his arms are two rosters doing two jobs — is
 * the same split anyway.
 */
function CategoryLine({
  categories,
  line,
  projected,
}: {
  categories: EspnCategory[];
  line: DayLine;
  projected: boolean;
}) {
  const groups = useMemo(() => categoryGroups(categories), [categories]);
  return (
    <div className="lg-cats">
      {groups.map((g) => (
        <div className="ov-cat-block" key={g.side}>
          <div className="lg-cat-row lg-cat-head">
            <span className="lg-cat-side">{g.label}</span>
            {g.categories.map((c) => (
              <span key={c.statId} title={c.name}>
                {c.label}
              </span>
            ))}
          </div>
          <div className="lg-cat-row">
            <span className="lg-cat-side" aria-hidden="true" />
            {g.categories.map((c) => {
              const v = categoryTotal(c, line);
              return (
                <span
                  key={c.statId}
                  className={projected ? 'ov-cat-val is-proj' : 'ov-cat-val'}
                  title={`${c.name}${projected ? ' — projected' : ''}`}
                >
                  {fmtValue(v ?? undefined, c)}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One man's row in a top-performer list. The whole row opens his page, which
 *  is what every other list of players in this app does (`ResearchTable`'s
 *  rows, the Transactions feed, a matchup's team page) — a name that is a link
 *  and a line beside it that is not would be two targets for one subject. */
function PerformerRow({
  rank,
  p,
  projected,
  categories,
  onOpenPlayer,
}: {
  rank: number;
  p: Performer;
  projected: boolean;
  /** The league's own, for a projected row — which prints them rather than a
   *  phrase of this file's choosing. */
  categories: EspnCategory[];
  onOpenPlayer: (id: number) => void;
}) {
  const summary = projected
    ? projSummary(p.kind, p.line, categories)
    : p.kind === 'pitcher'
      ? pitchSummary(p.line)
      : // **No strikeouts on a ranking row** — see `lib.ts::lineSummary`, where the
        // option is argued: the line under the name is here to say why this man
        // is first today, and a strikeout is never why.
        lineSummary(p.line.batting ?? NO_BATTING, { strikeouts: false });
  return (
    <button
      type="button"
      className="ov-perf"
      onClick={() => onOpenPlayer(p.id)}
      title={`${p.name} — open his page`}
    >
      <span className="ov-perf-rank">{rank}</span>
      <img className="ov-perf-face" src={headshotUrl(p.id)} alt="" loading="lazy" />
      <span className="ov-perf-body">
        <span className="ov-perf-name">{surname(p.name)}</span>
        <span className="ov-perf-line">{summary}</span>
      </span>
      <span
        className={projected ? 'ov-perf-val is-proj' : 'ov-perf-val'}
        title={
          p.value === null
            ? 'Your league scores nothing this can compute on his side of the ball'
            : `${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)} standard deviations of a player-day, averaged over the categories his side of the ball scores`
        }
      >
        {p.value === null ? '—' : `${p.value >= 0 ? '+' : ''}${p.value.toFixed(1)}`}
      </span>
    </button>
  );
}

/**
 * **Which men a day ranks, best first.**
 *
 * Written once because it is now read twice — the card takes the first three of
 * it and the dialog takes the lot — and two copies of a filter are two copies
 * that will one day disagree about who is on the board. Both halves matter:
 *
 * **The list is of men who *played*, which is a filter the totals do not
 * take.** A man in the lineup whose club was idle contributes 0 to every
 * counting category and nothing at all to the rates, so counting him in the
 * day's figures is right and costs nothing — and ranking him is not: a score of
 * exactly `+0.0` for having done nothing sorts **above** a man who went
 * 0-for-4, whose OPS contribution is genuinely negative.
 *
 * Found at 4am ET the morning after the page shipped, which is the hour that
 * makes it visible: the baseball day had rolled to a card with no games played
 * on it, and `TODAY` listed three men at `0-0` and `+0.0` under a category line
 * of noughts — where the block has a sentence for exactly that state and was
 * one empty list away from saying it.
 *
 * **A projected block takes no such filter**: every line in it is a fraction of
 * a game nobody has played, which is the whole point of it.
 */
function rankDay(performers: Performer[] | null, projected: boolean): Performer[] {
  return (performers ?? [])
    .filter((p) => p.value !== null && (projected || anyPlay(p.line)))
    .sort((a, b) => b.value! - a.value!);
}

/**
 * One of the day blocks.
 *
 * **Every state it can be in names its own cause**, which is four: no roster to
 * report on, a read still in flight with nothing on screen, a day whose lineup
 * nobody has played a game in yet, and the ordinary one. The third is the
 * common case at nine in the morning and is the reason it is a sentence rather
 * than an empty list — *no games yet* and *nobody did anything* are the same
 * empty box and very different mornings.
 */
function DayBlock({
  lead,
  date,
  projected = false,
  categories,
  categoriesTitle,
  performers,
  loading,
  onOpenPlayer,
  onSeeDay,
  seeDayTitle,
  onRankAll,
}: {
  /** `TODAY`, `YESTERDAY`, `TOMORROW`, `3 DAYS AGO` — the qualifier over the
   *  date, which is
   *  the app's own date face read in the same order (`.date-face-lead` over
   *  `.date-face-range`). */
  lead: string;
  date: string;
  projected?: boolean;
  categories: EspnCategory[];
  categoriesTitle: string;
  performers: Performer[] | null;
  loading: boolean;
  onOpenPlayer: (id: number) => void;
  /**
   * **Null draws no foot at all**, which is what it is for and no longer what
   * the opponent's carousel passes.
   *
   * *(It said: the door this opens is the Roster view, and that is yours — a
   * press promising somebody else's Tuesday and delivering your own would be
   * worse than no press. That was exactly right until the Roster grew an
   * `Opponent` switch, and it is the reason the switch makes this work: the
   * door can now open **his** Tuesday, because the page it opens can be about
   * him. The paragraph is kept rather than deleted — it is the record of what
   * the door had to be able to do before this foot could be drawn on his
   * cards.)*
   */
  onSeeDay: ((date: string) => void) | null;
  /** What the door says it will do, where naming the categories the ranking was
   *  made over is not the more useful fact — which is the opponent's carousel,
   *  whose foot opens a page about somebody the reader is not. */
  seeDayTitle?: string;
  /**
   * **The other door, and it does not leave the page.**
   *
   * `Top Performers` is three rows because three is the block's own height, and
   * the note on `TOP_N` has always said the fourth man is one press away — on
   * the *Roster view*, over that day, which is a different table with different
   * columns in a different order, reached by leaving the Overview. That is the
   * right door for *what did each of my men do*; it is a long way round for
   * *who was fourth*, which is this list with more of it.
   *
   * So the card offers the list itself: the same rows, the same arithmetic, the
   * same order, every man in the lineup instead of three, in a popup over the
   * page the reader is on. Null draws no button, which is what the empty states
   * pass — there is nothing to rank.
   */
  onRankAll: (() => void) | null;
}) {
  const total = useMemo(
    () => addLines((performers ?? []).map((p) => p.line)),
    [performers],
  );
  /** Everybody the day ranks, and the three the card has room for — see
   *  `rankDay`, which is the one place the filter and the sort are stated. */
  const all = useMemo(() => rankDay(performers, projected), [performers, projected]);
  const top = all.slice(0, TOP_N);

  return (
    <section className={projected ? 'ov-day ov-day-proj' : 'ov-day'}>
      <header className="ov-day-head">
        <span className="ov-day-lead">
          {lead}
          {projected ? (
            <span className="ov-day-proj-tag">
              <ProjectedGlyph size={12} /> PROJECTED
            </span>
          ) : null}
        </span>
        <span className="ov-day-date">{prettyGameDate(date)}</span>
      </header>

      {performers === null ? (
        loading ? (
          /* **A wait names what is being read**, and what it names is the date.
             It read `Reading your {lead}`, which was `Reading your today` on
             one of three cards and is `Reading your in 6 days` on one of
             fourteen — the lead is a *qualifier* over a date and only ever read
             as one. The date is the card's own subject and is a phrase at any
             distance from today. */
          <LoadingBlock>Reading {prettyGameDate(date)}</LoadingBlock>
        ) : (
          <p className="ov-day-empty">Nothing to report on — no roster is being read.</p>
        )
      ) : (
        <>
          <CategoryLine categories={categories} line={total} projected={projected} />
          {top.length === 0 ? (
            <p className="ov-day-empty">
              {/* **Four states, because the live tick made a fourth one
                  visible.** With the card following the day, there is now a
                  stretch — first pitch to first plate appearance — where the
                  games have started and nobody has done anything, and `No games
                  played yet.` was flatly wrong about it. The two facts are
                  different and the card holds both: `games` counts fixtures
                  that are under way or over, `anyPlay` asks whether anything
                  has happened in them. */}
              {/* **The day is not named in the sentence**, where it was
                  (`Nobody in tomorrow’s lineup…`). That worked while every card
                  was one of three words and does not survive a period —
                  `Nobody in in 6 days’s lineup` — and the fact was the head's
                  anyway, two lines above and at weight. */}
              {projected
                ? 'Nobody in the lineup has a game to play.'
                : anyPlay(total)
                  ? 'Nobody in the lineup has done anything worth ranking yet.'
                  : total.games > 0
                    ? 'Games are under way — nothing on the board yet.'
                    : 'No games played yet.'}
            </p>
          ) : (
            <>
              {/* **The list says what it is.** It was three named rows under a
                  category line with nothing between them, and the reading had to
                  be inferred from the shape — a rank, a face and a figure, which
                  is a leaderboard but not necessarily one *of* anything a reader
                  could name. The card's own head says which day; this says what
                  the rows under it are, which is the one thing on the card that
                  was being left to be worked out.

                  `title` carries which categories the ranking was made over,
                  where the `See the day` button used to hold it: a caption
                  naming them was cut for being on every card, and a heading that
                  *is* on every card is the right place for the fact to live. */}
              <div className="ov-perfs-head-row">
                <h4 className="ov-perfs-head" title={categoriesTitle}>
                  Top Performers
                </h4>
                {/* **And the figure at the right end says what it is.** The
                    rows carry a rank, a face, a line and a number, and the
                    number was the one column on the card with nothing over it
                    — a reader who has not opened its tooltip has a bold `+1.4`
                    beside a batting line and no way to tell it from another
                    stat. `VALUE` is the word the other three surfaces use for
                    the same figure (the roster lens and a matchup team page
                    print `Value`, the research lens `VAL`), which is the point
                    of naming it here rather than captioning it: one figure,
                    four surfaces, one word.

                    A sibling of the heading rather than a second half of it.
                    The `h4` names the list and a column label is not part of
                    that name — inside it, a screen reader navigating headings
                    would hear `Top Performers Value`. */}
                <span
                  className="ov-perfs-val-head"
                  title="What the day is worth in the categories your league scores — standard deviations of a player-day, averaged over the categories his side of the ball scores, and the figure these three are ranked by"
                >
                  Value
                </span>
              </div>
              <ol className="ov-perfs">
                {top.map((p, i) => (
                  <li key={p.key}>
                    <PerformerRow
                      rank={i + 1}
                      p={p}
                      projected={projected}
                      categories={categories}
                      onOpenPlayer={onOpenPlayer}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
          {/* **The foot is one control, where it was a caption and a control.**
              `10 LEAGUE CATEGORIES` sat at the left end of every card saying
              which set the ranking was made over — a fact that is true, is the
              same on all three cards, and is the same on every card a reader
              will ever see, since a league's categories do not change. A mark
              that would be on every row marks nothing, and this one was on nine
              of them. It survives where a fact of that kind belongs: as the
              `title` of the list it qualifies, and in this file's own note on
              `STANDARD_5X5` for the reader with no league, whose block is the
              one case where the answer is not what they'd assume. */}
          {(onSeeDay || (onRankAll && all.length > 0)) && (
            /* **Two doors share the foot, and the row is still one control
                wide.** `.ov-day-foot` is a grid of equal columns, so a card
                with one door draws it at the width of the card exactly as it
                did — the shape the note on `.ov-day-more` argues for is
                unchanged, and a second door divides the row rather than
                stacking under it and growing every card in the carousel.

                They are deliberately in this order: `Rank all` is more of what
                the reader is already looking at and stays on the page, so it
                sits beside the list it extends; `See the day` leaves for
                another view and goes last, which is where this app puts a door
                out. */
            <footer className="ov-day-foot">
              {onRankAll && all.length > 0 && (
                <button
                  type="button"
                  className="ov-day-more"
                  onClick={onRankAll}
                  /* The heading's own sentence with the count in front of
                     it — `Ranked over your league's 10 categories — R · HR · …`
                     is exactly what this list is, and it is already written
                     once for the three rows above. */
                  title={`All ${all.length}, ${categoriesTitle[0].toLowerCase()}${categoriesTitle.slice(1)}`}
                >
                  Rank all {all.length}
                </button>
              )}
              {onSeeDay && (
                <button
                  type="button"
                  className="ov-day-more"
                  onClick={() => onSeeDay(date)}
                  title={seeDayTitle ?? categoriesTitle}
                >
                  See the day
                </button>
              )}
            </footer>
          )}
        </>
      )}
    </section>
  );
}

/**
 * **The whole day, ranked, over the page rather than instead of it.**
 *
 * `Top Performers` names three men because three is the card's own height, and
 * the note on `TOP_N` has always ended *a fourth is one press away — the whole
 * roster's day is the Roster view with the date set to that day*. That is true
 * and it is the wrong press for this question. The Roster view answers *what
 * did each of my men do*: a wide table of stat columns in roster order, on
 * another view, with the date bar moved. **Who was fourth** is this list with
 * more of it — the same rows, the same arithmetic, the same order — and asking
 * it should not cost the reader the page they are on.
 *
 * **A popup rather than a taller card**, which is the app's own answer wherever
 * a detail belongs to one thing on screen (see *Popups, overlays and the Escape
 * ladder*). The alternative was a card that grows: a 25-row block inside a
 * scroll-snap row would put a vertical scroller inside a horizontal one, on a
 * page that scrolls vertically as well — three scrolls under one finger, which
 * is the geometry `touch-action` exists to arbitrate and cannot, the two inner
 * ones differing in neither place nor axis.
 *
 * **It is not in the URL, and that is a deliberate reading of the rule.** *Which
 * data a view shows belongs in the link* is about what the page **is** — a view,
 * a span, a lens, a subject (`player=`, `team=`, `mup=`). This is a drill-down
 * on one card of one row, opened and closed inside a reading the URL already
 * describes in full, and it is the same shape as every other panel in this app
 * that stays out of the query string: the Columns dialog, the stat filter
 * builder, `InfoKey`. Two params must never mean two things, and a param for a
 * box that is only ever opened by a press on a card it can be read from would
 * have been the third `proj=`-shaped mistake this app has already recorded.
 *
 * **Everything it draws, the card had.** No read is made for it: `performers`
 * is the whole day already — the card was slicing it — so the dialog is free,
 * and it cannot come to disagree with the three rows behind it because the
 * filter and the sort are `rankDay` for both.
 */
function RankedDayDialog({
  card,
  who,
  categories,
  categoriesTitle,
  onOpenPlayer,
  onClose,
}: {
  card: DayCardData;
  /** Whose day it is, where that is not the reader — the opponent's carousel.
   *  Null draws no name, a dialog opened off your own cards being about you by
   *  construction, which is the same rule that suppresses `Your matchup`'s tag
   *  on the one card at the top of this page. */
  who: string | null;
  categories: EspnCategory[];
  categoriesTitle: string;
  onOpenPlayer: (id: number) => void;
  onClose: () => void;
}) {
  const all = useMemo(() => rankDay(card.performers, card.projected), [card]);
  /** The day's own totals, exactly as the card prints them — over **everybody**
   *  in the lineup rather than over the men on the list, which is the split
   *  `rankDay` records: a man whose club was idle belongs in the figures and
   *  not in the ranking. */
  const total = useMemo(
    () => addLines((card.performers ?? []).map((p) => p.line)),
    [card.performers],
  );
  /**
   * **The two ways a man in the lineup is not on the list**, counted apart
   * because they are different facts about him and the card has room for
   * neither. A day that ranks nine of eleven should say what the other two
   * were — the app's own rule that an empty state names its own cause, applied
   * to the part of a list that is missing rather than to the whole of one.
   */
  const scorable = (card.performers ?? []).filter((p) => card.projected || anyPlay(p.line));
  const idle = (card.performers?.length ?? 0) - scorable.length;
  const unscored = scorable.length - all.length;

  return (
    <Modal
      title={
        <>
          {who ? `${who} — ` : ''}
          {card.word}, {prettyGameDate(card.date)}
          {card.projected ? (
            <span className="ov-day-proj-tag">
              <ProjectedGlyph size={12} /> PROJECTED
            </span>
          ) : null}
        </>
      }
      titleId="ov-ranked-title"
      className="ov-ranked-box"
      onClose={onClose}
    >
      {/* The same line the card carries, and the same component drawing it —
          the dialog opens *out of* a card and has to read as more of it rather
          than as a second opinion about the day. */}
      <CategoryLine categories={categories} line={total} projected={card.projected} />
      <div className="ov-perfs-head-row">
        <h4 className="ov-perfs-head" title={categoriesTitle}>
          {all.length} ranked
        </h4>
        <span className="ov-perfs-val-head" title={categoriesTitle}>
          Value
        </span>
      </div>
      <ol className="ov-perfs">
        {all.map((p, i) => (
          <li key={p.key}>
            <PerformerRow
              rank={i + 1}
              p={p}
              projected={card.projected}
              categories={categories}
              onOpenPlayer={onOpenPlayer}
            />
          </li>
        ))}
      </ol>
      {idle > 0 && (
        <p className="ov-day-empty">
          {idle} more in the lineup {card.projected ? 'have no game to play.' : 'had no game.'}
        </p>
      )}
      {unscored > 0 && (
        <p className="ov-day-empty">
          {unscored} more {unscored === 1 ? 'is' : 'are'} unranked — your league scores nothing this
          table can compute on {unscored === 1 ? 'his' : 'their'} side of the ball.
        </p>
      )}
    </Modal>
  );
}

/* ---- Player Spotlight ---------------------------------------------------- */

/**
 * **The block at the foot of the page** — three side-scrolling rows of ten
 * cards, split by seat, every card a door into that player's page, and a switch
 * that says which thirty men they are.
 *
 * It is the only block here that is not about the reader's own roster.
 * Everything above answers *how is my week going*; this answers *what should I
 * do about it*, from the two directions a manager weighs against each other:
 *
 * - **Trending** — who the league has been picking up. The question the
 *   research board's `Ros%` and `Δ` columns exist for, read there by sorting six
 *   hundred rows and read here by looking, over whichever of three windows is
 *   pressed.
 * - **High Value** — who the projection says is worth the most over the days
 *   this matchup has left. The same question the board's `VAL` column under the
 *   projected lens answers, and the same arithmetic
 *   (`categoryValue.ts::dayValue`) the day cards above rank their performers by.
 *
 * The pair is the reading. A man on both is one the league has noticed *and* the
 * projection likes; a man on the second alone is the pickup nobody has got to
 * yet, which is the best card on the page.
 *
 * **Three rows rather than one of thirty**, and the split is by seat rather than
 * by kind: a manager streaming a starter and a manager chasing saves are two
 * different errands, and a mixed list makes each of them scan past the other's
 * answers. It is ESPN's own eligibility that says which — the same join the
 * padlock and the slot chip run on — so a swingman listed at both reads as a
 * starter, which is what a league that lets you start him there means by it.
 *
 * **Free agents only, on both.** A man being added in three thousand leagues is
 * news; a man being added in three thousand leagues *who is already on
 * somebody's roster in this one* is news the reader can do nothing whatever
 * about. The same sentence holds one step further on for the value rail: a rail
 * of the best players in baseball is a rail of men nobody can have, and the
 * arithmetic is only worth printing where there is a decision behind it.
 *
 * **Both need a connected league and say nothing without one.** Roster
 * percentages are ESPN's and so is the category list a value is scored over, so
 * a reader with no league has neither rail — absent rather than empty, the app's
 * rule that a section with nothing to say is not a section.
 */

/** What every card on either rail draws above its figure: the identity, and the
 *  club and seat under it. */
export interface RailPlayer {
  id: number;
  name: string;
  /** The abbreviation — `BOS`, not `Boston Red Sox`. A full club name is three
   *  characters too many on a card this wide; see `App`'s own note, where the
   *  ellipsized second line that established it is measured. */
  team: string;
  /** ESPN's own, where there is one — `SP`, `RP`, `2B/SS`. Falls back to MLB's
   *  listed position, which is what the roster tables do for a player ESPN
   *  cannot be joined to. */
  position: string;
  kind: PlayerKind;
}

/** One card on the trending rail. */
export interface TrendingPlayer extends RailPlayer {
  /** Share of leagues rostering him now, or null where ESPN gave none. */
  rosterPct: number | null;
  /**
   * The move over each window the card draws, in points of roster percentage.
   *
   * **A window may be missing and a window may be null, and they are different
   * absences** — the research board's own two, read the same way here. Missing
   * is a span the server found no baseline for; null is a player ESPN has no
   * roster % for at all. Both print an em dash, and neither is a nought.
   */
  deltas: Partial<Record<TrendWindow, number | null>>;
}

/** One card on the high-value rail. */
export interface ValuePlayer extends RailPlayer {
  /** What his projected line is worth over the days the matchup has left, in
   *  the categories the league scores — `categoryValue.ts`, over the span
   *  undivided, which is the reading a projected board is opened for. */
  value: number;
  /** …and the same figure per appearance, which is the other reading the rail
   *  offers: *how good is he on a day he plays* against *how much will he give
   *  me this week*. See `ValueReading`, and `projectedRowValuePerGame` for why
   *  it needs no minimum-games floor. */
  perGame: number;
  /** How many games that projection is made of, which is the context the figure
   *  is meaningless without: six games of a good hitter outscore three of an
   *  equal one, and this is the column that says which he is. */
  games: number;
  rosterPct: number | null;
}

export interface RailBoard<T> {
  batters: T[];
  starters: T[];
  relievers: T[];
}

/** Which of the three rows — the seat, which is also what the `See more` card
 *  hands back, the research board's position pill being a function of it. */
export type RailSeat = keyof RailBoard<RailPlayer>;

/**
 * The trending rail, and **the window it was ranked on** — which is a choice
 * now rather than a fact.
 *
 * The card has printed three spans since it stopped printing one, and printing
 * three while ranking on the first is half an offer: *added most in the last
 * day* and *added most in the last week* are different lists of men, and the
 * second is the one a manager plans a week around. So the same three windows are
 * a switch, and the rail is ranked on whichever is pressed.
 *
 * `windows` is what the ownership read actually has a baseline for, so the
 * switch offers no span the server could not measure; `window` is the one in
 * force, which is not always the one asked for — see `App`, where a selection
 * with no baseline behind it falls back rather than emptying the rail.
 */
export interface TrendingRail {
  board: RailBoard<TrendingPlayer>;
  window: TrendWindow;
  windows: TrendWindow[];
}

/** The value rail, and the span it was drawn over — the heading names the last
 *  day so the reader never has to guess how far ahead the figure looks. */
export interface ValueRail {
  board: RailBoard<ValuePlayer>;
  /** Last day of the projected span, `YYYY-MM-DD`. */
  through: string;
}

/** How many each row holds. Ten is what the reader asked for and is about what
 *  a row can show before it stops being a glance and becomes a table. */
export const TRENDING_TOP = 10;

/**
 * **The three windows a trending card prints**, of the five the board offers.
 *
 * One number was the whole card and it was the wrong number to be alone with: a
 * four-point move overnight is a different player depending on whether the week
 * behind it is `+4` or `+20`, and the card could not tell them apart. Three
 * spans read as a shape — flat then sharp is a man who just did something, and a
 * steady climb is a man the league has been coming round to for a week.
 *
 * **Three rather than five.** `15d` and `30d` are the two that answer *is he
 * established*, which is a question about the season and belongs beside a stat
 * line you can sort; a section called *trending* is about the last few days, and
 * two more columns on a 124px card is a table.
 *
 * The rail is still **sorted on the first of them** — the heading says so — and
 * they are drawn in span order so the eye reads left to right through time.
 */
export const TRENDING_CARD_WINDOWS = [1, 3, 7] as const;

const RAIL_ROWS: { key: RailSeat; label: string }[] = [
  { key: 'batters', label: 'Batters' },
  { key: 'starters', label: 'Starting Pitchers' },
  { key: 'relievers', label: 'Relievers' },
];

/**
 * The card both rails draw: face, name, club and seat, then whatever figure the
 * rail it is on is about. A `<button>`, because every one of them is a door into
 * that player's page and a door has to be in the tab order and answer a
 * keyboard.
 */
function RailCard({
  p,
  onOpenPlayer,
  children,
}: {
  p: RailPlayer;
  onOpenPlayer: (id: number) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="trend-card"
      onClick={() => onOpenPlayer(p.id)}
      title={`${p.name} — open his page`}
    >
      <img className="trend-card-face" src={headshotUrl(p.id)} alt="" loading="lazy" />
      <span className="trend-card-name">{surname(p.name)}</span>
      <span className="trend-card-meta">
        {p.team}
        {p.position ? ` · ${p.position}` : ''}
      </span>
      {children}
    </button>
  );
}

/**
 * The three moves, labeled and in span order.
 *
 * **Colored by direction, which is the app's rule read straight**: color is
 * spent on state, and *rising* and *falling* are the state. It is the research
 * board's own presentation of the same fact — `formatTrend` and
 * `trendDirection` are imported from the board rather than written again, so
 * the two cannot come to disagree about the minus sign or about what a flat
 * `0.0` looks like.
 */
/** `day` / `3 days` — one span written one way, since four strings on this block
 *  name it and a rail whose heading and whose tooltip disagree about what `3D`
 *  means is worse than either. */
const spanWords = (w: TrendWindow): string => (w === 1 ? 'day' : `${w} days`);

const windowTitle = (w: TrendWindow): string =>
  `Change in roster % over the last ${spanWords(w)}`;

function TrendDeltas({
  deltas,
  ranked,
}: {
  deltas: Partial<Record<TrendWindow, number | null>>;
  /** The window the rail is sorted on, whose column is marked. */
  ranked: TrendWindow;
}) {
  return (
    <span className="trend-wins">
      {TRENDING_CARD_WINDOWS.map((w) => (
        // **The ranked column is named on the card, not only on the switch.**
        // Thirty cards ordered by a figure that looks like the two beside it is
        // a list whose order is a puzzle; one brighter label answers it where
        // the reader is looking. It marks something precisely because it is one
        // of three — the rule against a mark on every row is about the marks
        // that distinguish nothing.
        <span
          className={w === ranked ? 'trend-win-lab is-on' : 'trend-win-lab'}
          key={`h${w}`}
          title={windowTitle(w)}
        >
          {w}D
        </span>
      ))}
      {/* **The head rule is a grid row of its own**, spanning the three columns
          — which is what lets it cross the gaps the column rules stand in and
          come out as one continuous line rather than three segments with a
          break at each divider. It is drawn rather than declared as a
          `border-bottom` on the labels for exactly that reason: a border stops
          at the cell it is on. */}
      <span className="trend-wins-rule" />
      {TRENDING_CARD_WINDOWS.map((w) => {
        const v = deltas[w];
        const dir = trendDirection(v);
        return (
          <span
            className={dir === null ? 'trend-win-val' : `trend-win-val is-${dir}`}
            key={`v${w}`}
            title={windowTitle(w)}
          >
            {formatTrend(v)}
          </span>
        );
      })}
    </span>
  );
}

/**
 * **The last card in every row, and the only one that is not a player.**
 *
 * A rail is ten men and the board it is drawn from is six hundred, so the rail
 * has always had an eleventh answer it could not give: *and who else*. The
 * research board is where that question is answered — it is the same
 * population, the same free-agent cut and the same figure in a column — and
 * reaching it meant crossing to the tab, finding the position pill, finding the
 * column and sorting it, which is four presses to arrive at the list the reader
 * is already looking the tail of.
 *
 * **At the end rather than at the head**, which is where the question is asked:
 * a reader who wants more has scrolled the row to its end, and a door at the
 * far end is the one thing a scrolling row can offer that a heading cannot —
 * it is *found* by the gesture that produced the want.
 *
 * **It is the same box as a card**, not a link in the margin: it sits in the
 * flex row, takes the same width and the same border, and scrolls with the ten
 * ahead of it. What it does not take is a face — there is nobody on it — so the
 * circle is an arrow at the size the headshot is, which is what keeps the row's
 * baseline and its height the same on the card that has no player.
 */
function SeeMoreCard({
  seat,
  by,
  onSeeMore,
}: {
  seat: RailSeat;
  /** What the board will be sorted on, in the tab's own words — `the move over
   *  the last 3 days`, `projected value through Sep 6`. The switch's note says
   *  the same thing above the rail, so the door and the heading cannot come to
   *  describe two different boards. */
  by: string;
  onSeeMore: (seat: RailSeat) => void;
}) {
  const where =
    seat === 'batters' ? 'batters' : seat === 'starters' ? 'starting pitchers' : 'relievers';
  return (
    <button
      type="button"
      className="trend-card trend-more"
      onClick={() => onSeeMore(seat)}
      title={`Open the research board on free-agent ${where}, sorted by ${by}`}
    >
      <span className="trend-more-arrow" aria-hidden="true">
        →
      </span>
      <span className="trend-card-name">See more</span>
      <span className="trend-card-meta">on the board</span>
    </button>
  );
}

/** The three seat rows of one rail. The section around them is the spotlight's,
 *  which is why this draws no heading: the two rails are two readings of one
 *  block now rather than two blocks. */
function RailRows<T extends RailPlayer>({
  board,
  figure,
  sortedBy,
  onOpenPlayer,
  onSeeMore,
}: {
  board: RailBoard<T>;
  figure: (p: T) => ReactNode;
  /** What the board behind the `See more` card is sorted on, in words — the
   *  active tab's own, so the door and the heading agree by construction. */
  sortedBy: string;
  onOpenPlayer: (id: number) => void;
  /** Null where there is no board to open — a reader with no league has no
   *  rails at all, so this is really the Overview being drawn somewhere that
   *  cannot navigate. A door with nothing behind it is drawn as nothing, the
   *  rule every other door in this app keeps. */
  onSeeMore: ((seat: RailSeat) => void) | null;
}) {
  return (
    <>
      {RAIL_ROWS.filter((r) => board[r.key].length > 0).map((r) => (
        <div className="trend-row" key={r.key}>
          <h4 className="trend-row-head">{r.label}</h4>
          {/* Side-scrolling rather than wrapping: ten cards is two lines on a
              desktop and five on a phone, and a block that changes height by
              three lines between widths is a page that reads differently on
              every screen. `overscroll-behavior-x` keeps a flick that runs off
              the end from springing the page behind it — the app's standing
              rule, in the one axis this box genuinely scrolls. */}
          <div className="trend-scroll">
            <div className="trend-cards">
              {board[r.key].map((p) => (
                <RailCard key={`${p.kind}-${p.id}`} p={p} onOpenPlayer={onOpenPlayer}>
                  {figure(p)}
                </RailCard>
              ))}
              {onSeeMore && <SeeMoreCard seat={r.key} by={sortedBy} onSeeMore={onSeeMore} />}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** The trending rail's figure: the three moves, then the level they happened
 *  from — the context that says whether four points is a pickup nobody had or a
 *  man half the league already owns. Muted, because it is not the reading. */
function trendingFigure(p: TrendingPlayer, ranked: TrendWindow): ReactNode {
  return (
    <>
      <TrendDeltas deltas={p.deltas} ranked={ranked} />
      <span className="trend-card-pct">
        {p.rosterPct === null ? '—' : `${p.rosterPct.toFixed(0)}% rostered`}
      </span>
    </>
  );
}

/** A projected game count as the rest of the app prints one: to a tenth, with a
 *  whole number left whole. The same rule as `SummaryTable.tsx::projCount` and
 *  for the same reason — a reliever's `6.4` is a share of his club's games and a
 *  starter's `3` is three turns, and printing the second as `3.0` claims a
 *  precision the number has not got. */
const projGames = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * The value rail's figure.
 *
 * **Monochrome, where the trending rail's is colored** — and the difference is
 * the app's own rule rather than a taste. A move is a *state*, rising or
 * falling, and gets a color for it; a value is a ranking figure, and it is
 * already the reason the card is where it is on the rail. It is drawn exactly as
 * the day cards' performer rows draw the same arithmetic, one decimal and always
 * signed, so the two read as one figure.
 *
 * Under it, games first — it is what the figure is made of — and then the level,
 * which is the same context the trending card ends on and the answer to *has
 * anybody else noticed*.
 */
function valueFigure(p: ValuePlayer, reading: ValueReading): ReactNode {
  const perGame = reading === 'perGame';
  const v = perGame ? p.perGame : p.value;
  return (
    <>
      {/* **The same box the trending card's three moves are drawn in**, with one
          column instead of three — which is what makes the two rails' cards the
          same height by construction rather than by a measured `min-height`, and
          what stops the page moving under a reader who presses the switch. It
          also names the figure, which the day cards' own performer lists needed
          for the same reason: a bold signed number beside a batting line is not
          self-evidently a ranking. */}
      <span className="trend-wins is-solo">
        {/* **The label says which reading**, for the reason the ranked trend
            column is marked on the card and not only on the switch: a bold
            signed number is not self-evidently one figure rather than the other,
            and the reader is looking here rather than at the control. */}
        <span className="trend-win-lab">{perGame ? 'Val/G' : 'Value'}</span>
        <span className="trend-wins-rule" />
        <span className="trend-card-val">
          {v >= 0 ? '+' : '−'}
          {/* **Two decimals per appearance, one for the total**, and it is
              forced rather than chosen: the whole live spread of the
              per-appearance figure inside a seat is about 0.55–0.65 for
              batters, so one decimal prints seven of a top eight as `0.6` and
              the order of the rail becomes a puzzle. The cell is the same width
              either way — `+0.65` and `+13.8` are both five characters, against
              a track measured at 35.33px. */}
          {Math.abs(v).toFixed(perGame ? 2 : 1)}
        </span>
      </span>
      <span className="trend-card-pct">
        {`${projGames(p.games)} G`}
        {p.rosterPct === null ? '' : ` · ${p.rosterPct.toFixed(0)}% rostered`}
      </span>
    </>
  );
}

/** Which reading of the spotlight is on screen. In the URL as `spot=value`, the
 *  trending rail being the one it opens on. */
export type SpotlightTab = 'trending' | 'value';

/**
 * **Which way the value rail is read** — the whole span added up, or one
 * appearance of him.
 *
 * They are different questions and neither answers the other. `total` is *how
 * much will he give me over the days this matchup has left*, which is what a
 * projected board is opened for and why it was the only reading for as long as
 * there was one; `perGame` is *how good is he on a day he plays*, which is the
 * question a manager streaming one open day is actually asking, and on which a
 * hitter with eight games can beat one with eleven.
 *
 * Measured on the live boards over 2026-08-26 → 09-06, the batters' row: the
 * total gives `Crow-Armstrong · Alonso · Witt Jr. · Alvarez · Ohtani` and the
 * per-appearance reading gives `Crow-Armstrong · Cruz · Tatis Jr. · Witt Jr. ·
 * Ohtani` — Oneil Cruz (7.8 G) and Fernando Tatis Jr. (8.7 G) rising past two
 * eleven-game men. On the starters' row Gerrit Cole leads the total on three
 * turns and is off the top eight per turn. So the switch is a real second list
 * rather than a re-ordering at the margin, which is the test the trend windows'
 * own switch was held to.
 *
 * **In the URL as `spotv=avg`**, `total` being the default and so writing
 * nothing — and scoped one step further in than `spot=`, exactly as `spotw=` is
 * on the other rail: a reading on a link that opens the *trending* rail names a
 * ranking nothing on screen is made of. It is separate state from the tab, so a
 * reader who picks it, crosses to Trending and comes back finds it where he
 * left it — a sub-selection inside a page is not a leaving.
 */
export type ValueReading = 'total' | 'perGame';

/**
 * **Player Spotlight — the two rails as one block with a switch.**
 *
 * They were two sections, one under the other, and that was the wrong shape for
 * what they are: the same thirty cards in the same three rows, ranked two ways.
 * Stacked, the page ended in six seat headings and sixty cards and the reader
 * had to hold *which rail am I in* while scrolling through it — where the
 * question the block answers is one question with two answers, which is what a
 * switch is for.
 *
 * **The note is the tab's, not the block's.** `Player Spotlight` says what the
 * section is and cannot say what the figure on the card means; the note beside
 * it does, and changes with the switch — `added most in the last day` against
 * `most projected value through Sep 6`. So the heading never has to carry both,
 * and the card never has to explain itself.
 *
 * **The switch is drawn only where there are two things to switch between.** The
 * value rail lands after the trending one (two board reads against a map already
 * in hand) and is absent entirely once the matchup has no days left, and a
 * control with one live option is a control that marks nothing — the app's own
 * rule, the same one that suppresses the kind tabs when one kind is watched. It
 * is also why the tab that a `?spot=value` link names **falls back rather than
 * emptying the view**: an inbound link can easily name a rail this reader has
 * not got.
 */
function SpotlightSection({
  trending,
  highValue,
  tab,
  onTab,
  onWindow,
  valueReading,
  onValueReading,
  onOpenPlayer,
  onSeeMore,
}: {
  trending: TrendingRail | null;
  highValue: ValueRail | null;
  tab: SpotlightTab;
  onTab: (tab: SpotlightTab) => void;
  onWindow: (w: TrendWindow) => void;
  /** Which way the value rail is read — see `ValueReading`. */
  valueReading: ValueReading;
  onValueReading: (r: ValueReading) => void;
  onOpenPlayer: (id: number) => void;
  /** The door at the end of every row — see `SeeMoreCard`. It is handed the
   *  **active** rail rather than reading `tab`, which is not always the rail on
   *  screen: a `?spot=value` that arrives before the value rail falls back, and
   *  a door that opened the board on a reading the page is not showing would be
   *  the same fault the fallback exists to prevent. */
  onSeeMore: ((rail: SpotlightTab, seat: RailSeat) => void) | null;
}) {
  const tabs: { key: SpotlightTab; label: string; note: string; title: string; sortedBy: string }[] =
    [];
  if (trending) {
    tabs.push({
      key: 'trending',
      label: 'Trending',
      note: `added most in the last ${spanWords(trending.window)}`,
      title: `Who the league has been picking up over the last ${spanWords(trending.window)} — free agents only`,
      sortedBy: `the move over the last ${spanWords(trending.window)}`,
    });
  }
  if (highValue) {
    const per = valueReading === 'perGame';
    tabs.push({
      key: 'value',
      label: 'High Value',
      // **The note names the reading, not just the span.** The two figures are
      // not comparable to each other any more than either is to a day card's
      // `+1.4`, so the sentence under the heading has to say which one the rail
      // in front of the reader is ordered by.
      note: per
        ? `most projected value per game through ${prettyDate(highValue.through)}`
        : `most projected value through ${prettyDate(highValue.through)}`,
      title: per
        ? 'Who is worth the most per appearance over the days this matchup has left, in the categories your league scores — free agents only'
        : 'Who is worth the most over the days this matchup has left, in the categories your league scores — free agents only',
      sortedBy: per
        ? `projected value per game through ${prettyDate(highValue.through)}`
        : `projected value through ${prettyDate(highValue.through)}`,
    });
  }
  if (tabs.length === 0) return null;
  const active = tabs.find((t) => t.key === tab) ?? tabs[0];
  return (
    <section className="ov-trending">
      {/* A wrapper with no layout of its own, and it earns its place: the
          section is a 14px flex column, and the heading and the switch under it
          are one thing separated by the heading's own 8px. Two flex children
          would be 22px apart. */}
      <div className="ov-spot-head">
        <h3 className="ov-heading">
          Player Spotlight
          <span className="ov-heading-note">{active.note}</span>
        </h3>
        {(tabs.length > 1 ||
          (active.key === 'trending' && (trending?.windows.length ?? 0) > 1) ||
          (active.key === 'value' && highValue !== null)) && (
          <div className="ov-spot-tools">
            {/* **Two switches, and only where each has two things to choose
                between.** A control with one live option marks nothing — the
                same rule that suppresses the kind tabs on a watchlist of one
                kind. The rails' switch goes when the value rail has not landed
                (or the matchup has no days left); the windows' switch goes when
                the ownership read has one baseline, and both times what is left
                is the reading itself rather than a control that cannot be
                pressed. */}
            {tabs.length > 1 && (
              <div className="view-switch" role="tablist" aria-label="Player spotlight">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={t.key === active.key}
                    className={`view-tab${t.key === active.key ? ' active' : ''}`}
                    onClick={() => onTab(t.key)}
                    title={t.title}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {active.key === 'value' && highValue && (
              // **The readings' switch is the value rail's alone**, drawn where
              // the trending rail draws its windows and for the identical
              // reason: it is a cut of *this* reading, and a control left on
              // screen naming a divisor the trending rail is not ranked by
              // would be a lens the page claims is in force when it is not.
              //
              // **It is never suppressed the way the other two are.** The rule
              // there is that a control with one live option marks nothing —
              // the rails' switch goes when there is one rail, the windows'
              // when the ownership read has one baseline. This one always has
              // exactly two, and both are always answerable off the figures the
              // rail is already built from.
              <div className="view-switch" role="tablist" aria-label="Value reading">
                {(
                  [
                    ['total', 'Total', 'Rank on the whole span added up — who will give me the most over these days'],
                    ['perGame', 'Per G', 'Rank on value per appearance — how good he is on a day he plays'],
                  ] as const
                ).map(([key, label, title]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={key === valueReading}
                    className={`view-tab${key === valueReading ? ' active' : ''}`}
                    onClick={() => onValueReading(key)}
                    title={title}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {active.key === 'trending' && trending && trending.windows.length > 1 && (
              // **The windows' switch is the trending rail's alone**, which is
              // why it is drawn beside the rails' switch rather than under the
              // heading in its own right: it is a cut of *this* reading, and a
              // control that stayed on screen naming a span the value rail is
              // not ranked over would be a lens the page says is in force when
              // it is not.
              <div className="view-switch" role="tablist" aria-label="Trend window">
                {trending.windows.map((w) => (
                  <button
                    key={w}
                    type="button"
                    role="tab"
                    aria-selected={w === trending.window}
                    className={`view-tab${w === trending.window ? ' active' : ''}`}
                    onClick={() => onWindow(w)}
                    title={`Rank on the move over the last ${spanWords(w)}`}
                  >
                    {w}D
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {active.key === 'value' && highValue ? (
        <RailRows
          board={highValue.board}
          figure={(p) => valueFigure(p, valueReading)}
          sortedBy={active.sortedBy}
          onOpenPlayer={onOpenPlayer}
          onSeeMore={onSeeMore && ((seat) => onSeeMore('value', seat))}
        />
      ) : trending ? (
        <RailRows
          board={trending.board}
          figure={(p) => trendingFigure(p, trending.window)}
          sortedBy={active.sortedBy}
          onOpenPlayer={onOpenPlayer}
          onSeeMore={onSeeMore && ((seat) => onSeeMore('trending', seat))}
        />
      ) : null}
    </section>
  );
}

/* ---- The view ------------------------------------------------------------ */

/**
 * **Three days as one swipeable row** — and it is a component of its own
 * because the page now draws **two** of them: the reader's days, and the days
 * of whoever they are playing this week.
 *
 * It was written inline in the view when there was one. Two copies of a
 * scroll-snap row with its own centering, its own dot state and its own
 * measuring would be two things that agree today, which is the rule this
 * codebase applies to a selector list and applies just as hard to a control:
 * the two rows are the same object, so they are one component drawn twice.
 *
 * **One mechanism at every width.** `.ov-days` is a scroll-snap row always;
 * what changes at 900px is the cards' flex basis — a whole scrollport apiece
 * below it, an equal share above. So above the breakpoint the row does not
 * overflow, nothing scrolls, nothing snaps and the dots are not drawn. The
 * desktop layout is what a carousel that fits looks like.
 */
/** One card of the row, as the view hands it to the carousel: the day, what to
 *  call it, whether it is an estimate, and what it has to draw. Built in
 *  `OverviewView` so the two carousels are one shape scored one way. */
interface DayCardData {
  date: string;
  /** `TODAY`, `3 DAYS AGO` — the card head's own small caps. */
  lead: string;
  /** The same word in title case, for a dot's label and a dialog's title. */
  word: string;
  projected: boolean;
  loading: boolean;
  performers: Performer[] | null;
}

/**
 * **The days of the period that are not one of the three the page reads on
 * entry**, and what each of the two halves costs.
 *
 * The split is not tidiness, it is the two upstreams answering differently:
 *
 * - **Played days are one read for the lot.** `/api/report` over a span carries
 *   every game with its own date and a `lineups` map keyed by date, so the
 *   whole back half of a fortnight comes out of one request — which is why this
 *   is a single answer rather than a map of them.
 * - **Unplayed days are one read each.** The projection engine hands back a
 *   *span total* with no per-day breakdown (`RosterProjection`), so a span
 *   cannot be split back apart and each day has to be asked for on its own.
 *   Hence the map, and hence `READ_AHEAD`.
 *
 * Neither is on the page's own settle gate: a reader who never swipes past
 * tomorrow pays for neither, which is the same rule that keeps the whole
 * Overview off the boot gate.
 */
export interface ExtraDays {
  past: { players: PlayerReport[]; lineups: Record<string, string[]> | null } | null;
  pastLoading: boolean;
  /**
   * **Has the played half been answered, one way or the other?** — which
   * `past` alone cannot say, `null` meaning both *not asked yet* and *asked and
   * failed*. The card draws a wait for the first and its empty state for the
   * second, so the two have to be told apart: a day nobody has asked for has an
   * answer coming, and a day whose read failed has not.
   *
   * The forward half needs no twin of this. Its map is keyed by date and
   * `futureLoading[date]` is `undefined` before the read and `false` after it
   * either way, so the same distinction falls out of the lookup.
   */
  pastSettled: boolean;
  future: Record<string, RosterProjection>;
  futureLoading: Record<string, boolean>;
}

/**
 * **How far either side of the card in view the row reads ahead.**
 *
 * One, and it is a judgment about what a swipe costs rather than a round
 * number. Every day past tomorrow is a projection of its own — the engine hands
 * back a span total with no per-day breakdown, so a fortnight is a fortnight of
 * requests — and firing them all on entry would put twelve reads behind a page
 * whose whole discipline is that it arrives at once. Firing none until the card
 * is centered would show a wait on every swipe.
 *
 * One ahead is the first number that hides the read behind the gesture: the
 * neighbor is asked for while the reader is still looking at the card they are
 * on, and a swipe lands on figures. The reader who never swipes pays nothing,
 * which is the same rule that keeps this whole page off the boot gate.
 */
const READ_AHEAD = 1;

/**
 * **…and how long the row waits for the scroll to stop first.**
 *
 * Measured, and the measurement is why it exists: pressing the last dot of a
 * fourteen-day row scrolls smoothly across the whole period, `active` genuinely
 * takes every value on the way, and the effect below fired at each one — **nine
 * projections asked for to look at one day**. A flick does the same thing with
 * a finger.
 *
 * 200ms of no further movement is the gesture being over. It is short enough
 * that a reader who swipes one card and stops has asked for the next before
 * they have finished looking at this one, and long enough that the cards a
 * flick merely *crosses* are never asked for at all. Re-verified after: the
 * same press asks for three days rather than eleven.
 */
const READ_SETTLE = 200;

function DayCarousel({
  cards,
  days,
  opensOn,
  onNeed,
  categories,
  categoriesTitle,
  onOpenPlayer,
  onSeeDay,
  seeDayTitle,
  onRankDay,
  label,
}: {
  /** Every day of the period, in date order. */
  cards: DayCardData[];
  /** The same days as bare dates, and the read-ahead effect's dependency —
   *  `cards` is rebuilt on every render (the figures in it move) where this is
   *  `App`'s own memo and changes only when the period does. */
  days: string[];
  /** Which of them the row opens on — today, where today is in the period. */
  opensOn: number;
  /** **This day is on screen or next to it.** What that costs is the app's
   *  business, not the row's: see `App.tsx::needOverviewDay`, where a day
   *  before yesterday is one read for the whole back half of the period and a
   *  day past tomorrow is one projection of its own. */
  onNeed: (date: string) => void;
  categories: EspnCategory[];
  categoriesTitle: string;
  onOpenPlayer: (id: number) => void;
  onSeeDay: ((date: string) => void) | null;
  /** The foot's own `title`, where the row's door is about somebody other than
   *  the reader — see `DayBlock`. */
  seeDayTitle?: string;
  /** Open this card's whole ranked list over the page — see
   *  `RankedDayDialog`. The row raises it rather than each block, there being
   *  one dialog at a time and the row being what knows which card it came
   *  from. */
  onRankDay: (card: DayCardData) => void;
  /** What the row is, for the two labels a screen reader gets — the row's own
   *  and its dots'. Two carousels on one page cannot both be called
   *  "Yesterday, today and tomorrow". */
  label: string;
}) {
  /**
   * **`useOverflowArrows` does the measuring**, folded rather than copied: that
   * hook is `TabStrip.tsx`'s general answer to *does this row overflow*, it
   * already measures on every render (a day block gains rows when its read
   * lands, and a `ResizeObserver` on the box hears nothing when the content is
   * what moved) and it already owns the one observer. What this adds is the two
   * things that are a carousel's rather than a scrolling row's — which card is
   * centered, and putting one there.
   */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { state, measure } = useOverflowArrows(boxRef, wrapRef);
  const over = state.over;
  const [active, setActive] = useState(opensOn);

  /**
   * **Put card `i` in the middle of the scrollport.**
   *
   * Written as a `scrollTo` on the row itself rather than as `scrollIntoView`,
   * which is the rule the League page's week list already records: that walks
   * *every* scrollable ancestor including the page, so centering a card would
   * also carry the whole Overview up or down under a reader who asked for
   * neither. With two carousels on the page that is no longer a hypothetical —
   * the second one is below the fold, and centering it on mount would scroll
   * the page to it.
   *
   * The offset is measured off the two rects rather than computed from a card
   * width and a gap. Those are a percentage and a token, and the arithmetic
   * would be a third opinion about a number the browser already has — and the
   * wrong one at the ends, where the row's own padding is what lets the first
   * and last cards reach the middle at all.
   */
  const center = useCallback((i: number, behavior: ScrollBehavior = 'auto') => {
    const box = boxRef.current;
    const card = box?.children[i] as HTMLElement | undefined;
    if (!box || !card) return;
    const delta =
      card.getBoundingClientRect().left -
      box.getBoundingClientRect().left -
      (box.clientWidth - card.clientWidth) / 2;
    box.scrollTo({ left: box.scrollLeft + delta, behavior });
  }, []);

  /** Which card the row is showing: the one whose center is nearest the
   *  scrollport's. A distance test rather than a division by the card pitch,
   *  for the reason `center` measures — and it is the honest answer mid-swipe,
   *  where there is no whole card on screen and the dot should already have
   *  moved to the one arriving. */
  const onScroll = useCallback(() => {
    measure();
    const box = boxRef.current;
    if (!box) return;
    const mid = box.getBoundingClientRect().left + box.clientWidth / 2;
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < box.children.length; i++) {
      const r = (box.children[i] as HTMLElement).getBoundingClientRect();
      const gap = Math.abs(r.left + r.width / 2 - mid);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    // Guarded, because this fires on every frame of a flick and the dots are
    // the only thing reading it.
    setActive((a) => (a === best ? a : best));
  }, [measure]);

  /**
   * **The row opens on today**, and it opens there *before paint* — a layout
   * effect, so nobody sees the day before it for a frame and watches it slide.
   *
   * **Keyed on `over` and on `opensOn`**, which is what makes it fire at the
   * moments it has to and no other. On mount the hook measures in its own
   * layout effect, `over` goes false → true, and this runs on the flush that
   * follows, still before paint. The second moment is a window crossing the
   * breakpoint from a desk width down to a phone one, where a row that could
   * not scroll now can and would otherwise sit at `scrollLeft: 0`.
   *
   * **`opensOn` is the third**, and it is new with the period: the row is three
   * days long until the matchup window answers and the whole period after it,
   * which moves today from the middle of three cards to wherever it falls in
   * fourteen. Without it the row would keep its `scrollLeft` and quietly be
   * showing a different day. (In practice it fires once — the page's own gate
   * waits on that window — and the dependency is what makes that a fact rather
   * than a hope.)
   *
   * It deliberately does **not** re-center on anything else. A reader who has
   * swiped to Thursday and is reading it must not be carried back to today
   * because a projection landed — the same rule as *never over data*, one axis
   * over.
   */
  useLayoutEffect(() => {
    if (!over) return;
    center(opensOn, 'auto');
    setActive(opensOn);
  }, [over, opensOn, center]);

  /**
   * **Read the card in view and its neighbors** — see `READ_AHEAD`.
   *
   * On `active` rather than on a scroll handler, and **behind `READ_SETTLE`**,
   * which is what makes a flick across six days ask for the one it stops on
   * rather than for all six it crossed. (React's batching was assumed to do
   * that on its own and does not: a smooth scroll commits every index it passes
   * through, which was measured at nine projections for one press of the last
   * dot.) `onNeed` is idempotent by contract — App holds what it has asked
   * for — so a re-entry costs nothing.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      for (let i = active - READ_AHEAD; i <= active + READ_AHEAD; i++) {
        if (i >= 0 && i < days.length) onNeed(days[i]);
      }
    }, READ_SETTLE);
    return () => clearTimeout(t);
  }, [active, days, onNeed]);

  return (
    <div className="ov-carousel" ref={wrapRef}>
      {/* **`is-span` is the row being longer than a desk can hold**, and it is
          the measurement rather than the count that the stylesheet acts on: at
          three cards this class is absent and the row is the three columns it
          has always been above 900px, at four or more it stays a carousel at
          every width and shows three of them at a desk. */}
      <div
        className={cards.length > 3 ? 'ov-days is-span' : 'ov-days'}
        ref={boxRef}
        onScroll={onScroll}
        aria-label={label}
      >
        {cards.map((c, i) => (
          <DayBlock
            key={c.date}
            lead={c.lead}
            date={c.date}
            projected={c.projected}
            categories={categories}
            categoriesTitle={categoriesTitle}
            performers={c.performers}
            loading={c.loading}
            onOpenPlayer={onOpenPlayer}
            onSeeDay={onSeeDay}
            seeDayTitle={seeDayTitle}
            onRankAll={() => onRankDay(cards[i])}
          />
        ))}
      </div>
      {/* **Drawn only while the row overflows**, which is the measurement
          deciding rather than the breakpoint: three dots over a row already
          showing all three days would be a control for a scroll that cannot
          happen. They are buttons as well as a position — a pointer user has no
          swipe, and the peek at the card edges is the only other thing saying
          there is more of the row than this.

          **A dot a day, whatever the period's length.** A fortnight is fourteen
          of them, which is 190px of the 276 a 320px window leaves — measured,
          and it is why they are not a scroller of their own. `flex-wrap` is the
          safety rather than the design: a league whose period ran past twenty
          days would wrap a second line rather than burst the page. */}
      {over && (
        <div className="ov-dots" role="group" aria-label={`Which day — ${label}`}>
          {cards.map((c, i) => (
            <button
              key={c.date}
              type="button"
              className={`ov-dot${i === active ? ' is-on' : ''}`}
              aria-current={i === active ? 'true' : undefined}
              aria-label={`${c.word} — ${prettyGameDate(c.date)}`}
              title={`${c.word} — ${prettyGameDate(c.date)}`}
              onClick={() => center(i, 'smooth')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OverviewView({
  board,
  onOpenMatchup,
  today,
  yesterday,
  tomorrow,
  todayProjection,
  oppToday,
  oppYesterday,
  oppTomorrow,
  oppTodayProjection,
  oppTodayLineup,
  oppYesterdayLineup,
  oppLoadingToday,
  oppLoadingYesterday,
  oppLoadingTomorrow,
  oppLoadingTodayProjection,
  opponentName,
  todayLineup,
  yesterdayLineup,
  loadingToday,
  loadingYesterday,
  loadingTomorrow,
  loadingTodayProjection,
  knownPlayers,
  days,
  extra,
  oppExtra,
  onNeedDay,
  onNeedOppDay,
  trending,
  highValue,
  spotlight,
  onSpotlight,
  onSpotWindow,
  valueReading,
  onValueReading,
  onSeeMore,
  dates,
  onOpenPlayer,
  onSeeDay,
  onSeeOppDay,
  connected,
  ready,
}: {
  board: EspnScoreboard | null;
  onOpenMatchup: (id: number) => void;
  /** Who the league has been picking up over the last day, in three rows — see
   *  `PlayerRail`. Null with no connected league, whose roster percentages these
   *  are, and the block is absent rather than empty. */
  trending: TrendingRail | null;
  /** …and who is worth the most over the days the matchup has left, in the same
   *  three rows. Null until the two projected boards it is built from have
   *  landed, and with no connected league at all — a value is scored against a
   *  league's own categories, and there is no matchup to have days left of. */
  highValue: ValueRail | null;
  /** Which of the two the spotlight is showing, and the setter behind its
   *  switch. Held in `App` rather than here because it is in the URL — see
   *  `SpotlightSection`. */
  spotlight: SpotlightTab;
  onSpotlight: (tab: SpotlightTab) => void;
  /** …and the window the trending rail is ranked on. The value in force rides on
   *  `trending` itself, this being the one that was asked for. */
  onSpotWindow: (w: TrendWindow) => void;
  /** Which way the High Value rail is read — see `ValueReading`. */
  valueReading: ValueReading;
  onValueReading: (r: ValueReading) => void;
  /** The door at the end of every rail row: the research board, on this seat's
   *  position pill, free agents only, sorted on the column the rail is ranked
   *  by. See `SeeMoreCard`, and `App::openSpotlightBoard` for what it sets. */
  onSeeMore: ((rail: SpotlightTab, seat: RailSeat) => void) | null;
  /** The three reads. Null means *not answered yet*; an empty array means
   *  *answered, and there is nobody* — the two are drawn differently and the
   *  distinction is the whole of why these are nullable. */
  today: PlayerReport[] | null;
  yesterday: PlayerReport[] | null;
  tomorrow: RosterProjection | null;
  /** **What today is worth, for the hours before it starts.** Read alongside
   *  the other three rather than after the report has said whether it is
   *  wanted: a dependent read would put a second wait in front of the one card
   *  a reader opens this page for, and it is one more answer off an engine the
   *  page is already asking. Null where it failed, which costs the card its
   *  lens and nothing else. */
  todayProjection: RosterProjection | null;
  /** **The same four reads again, for the manager on the other side of this
   *  week's matchup.** All null where there is no league, no matchup or a bye —
   *  the section is not drawn at all in any of those, so nothing here has an
   *  empty state of its own. */
  oppToday: PlayerReport[] | null;
  oppYesterday: PlayerReport[] | null;
  oppTomorrow: RosterProjection | null;
  oppTodayProjection: RosterProjection | null;
  oppTodayLineup: Set<string> | null;
  oppYesterdayLineup: Set<string> | null;
  oppLoadingToday: boolean;
  oppLoadingYesterday: boolean;
  oppLoadingTomorrow: boolean;
  oppLoadingTodayProjection: boolean;
  /** Whose days they are, for the heading — and the one test the section is
   *  drawn on, so a null here is the whole of "there is nobody to compare
   *  with". */
  opponentName: string | null;
  /** Who was in the lineup on each played day, as player keys. Null in
   *  saved-roster mode and on a day the per-day read could not answer for, in
   *  which case the block counts everybody and says `Watchlist` rather than
   *  claiming a lineup it does not have. */
  todayLineup: Set<string> | null;
  yesterdayLineup: Set<string> | null;
  loadingToday: boolean;
  loadingYesterday: boolean;
  loadingTomorrow: boolean;
  loadingTodayProjection: boolean;
  /** For the projected block's names: a projected line carries a key, an id and
   *  a kind and no name at all, the engine having no business holding one. */
  knownPlayers: SeasonPlayer[];
  /**
   * **Every day the two carousels draw, in date order** — the matchup period,
   * widened to hold yesterday, today and tomorrow wherever the period's own
   * edges fall. Derived in `App.tsx::overviewDays`, which is where the widening
   * is argued; three days exactly for a reader with no league.
   */
  days: string[];
  /** The days that are not one of the three named ones, and what they cost —
   *  see `ExtraDays`. */
  extra: ExtraDays;
  oppExtra: ExtraDays;
  /** **This day is on screen or next to it.** Idempotent by contract: App holds
   *  what it has already asked for, so the carousel may say it as often as it
   *  likes. */
  onNeedDay: (date: string) => void;
  onNeedOppDay: (date: string) => void;
  dates: { today: string; yesterday: string; tomorrow: string };
  onOpenPlayer: (id: number) => void;
  onSeeDay: (date: string) => void;
  /**
   * **The same door, landing on the opponent** — the Roster view over that day
   * with its `Opponent` switch on.
   *
   * A prop of its own rather than a flag on `onSeeDay`, because the two are
   * different destinations and the page that owns the destination is App: one
   * callback that took *whose* would put half of a navigation decision in the
   * component that only knows which card was pressed. Null where the app cannot
   * offer it, which is the same three-way absence `opponentName` already has —
   * so the foot is drawn on his cards exactly when there is a page behind it.
   */
  onSeeOppDay: ((date: string) => void) | null;
  connected: boolean;
  /** **The page may be drawn** — every read behind it has answered, all nine of
   *  them, the board included and including the four that only exist once the
   *  board has said who the opponent is. Worked out in
   *  `App.tsx::overviewSettled`, which is where the two things this component
   *  cannot see live: whether a read has been *asked for* yet, and whether a
   *  board is still coming.
   *
   *  **Latched there, so it is one-way.** A re-read — the tab crossed and come
   *  back to, the clock rolling on resume — leaves this true and the cards
   *  standing, which is rule 1: a curtain belongs where there is nothing to
   *  show, and by then there is. */
  ready: boolean;
}) {
  /**
   * **The league's categories, or the standard 5×5.** A reader with no league
   * still has a roster and still has days; what he has not got is anybody's
   * opinion about which categories matter, so the block says which set it
   * ranked over rather than leaving him to assume it was his.
   */
  const categories = board?.categories?.length ? board.categories : STANDARD_5X5;
  /**
   * **The caption says which *set*, not which league.** It printed
   * `board.leagueName` and read as a non-sequitur under a list of players —
   * `THETA CHI. WHY NOT?` says nothing about how anybody was ranked. What the
   * line is for is the one thing a reader cannot infer: whether the ordering
   * was his league's or a default, which is a question only somebody with no
   * league connected can get wrong. So it names the count where there is a
   * league and the standard where there is not, with the categories themselves
   * in its `title`.
   */
  const own = board?.categories?.length ? board.categories.length : 0;
  const categoriesTitle = `Ranked over ${
    own > 0 ? `your league's ${own} categories` : 'the standard 5×5'
  } — ${categories.map((c) => c.label).join(' · ')}`;

  /** The ball, once the wait has outlasted `WAIT_DELAY` — see the gate at the
   *  foot of this component, where it is argued. Called here because it is a
   *  hook and the gate is a return. */
  const showWait = useDelayedFlag(!ready);

  const nameOf = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of knownPlayers) map.set(p.id, p.name);
    return map;
  }, [knownPlayers]);

  /** A played day, scored. `lineup` cuts the men rather than the days, this
   *  being one day — `projectStarters`'s two-tier rule collapses to a set
   *  membership test when the range is a single date, and doing it here keeps
   *  the block from having to hold a report at all. */
  const scorePlayed = (
    reports: PlayerReport[] | null,
    date: string,
    lineup: Set<string> | null,
  ): Performer[] | null => {
    if (!reports) return null;
    const out: Performer[] = [];
    for (const r of reports) {
      const key = playerKey(r);
      if (lineup && !lineup.has(key)) continue;
      const line = lineOf(r, date);
      out.push({
        key,
        id: r.id,
        name: r.name,
        kind: r.kind,
        line,
        value: dayValue(r.kind, line, categories).total,
      });
    }
    return out;
  };

  /** A projected day. **`lineup` is the projection's own plan**, not a read of
   *  ESPN — a day nobody has played has no lineup yet, and what the engine can
   *  say is what it would start him for (`ProjectedPlayerLine.lineup`). A man
   *  it would bench every day of the span has an empty `days` and is not in the
   *  block, which is the same cut the played days make and the reason the three
   *  read alike.
   *
   *  **Two callers now**, which is why it takes its day: Tomorrow always, and
   *  Today until Today starts. */
  const scoreProjected = (proj: RosterProjection | null, date: string): Performer[] | null => {
    if (!proj) return null;
    const out: Performer[] = [];
    for (const p of proj.players) {
      const seat = p.lineup;
      const day = seat?.days.find((d) => d.day === date);
      // Without a lineup at all — a saved watchlist, or a league that published
      // no slot counts — every man with a game is in the block, which is what
      // the roster table's own projected reading does in the same case.
      if (seat && !day) continue;
      const line: DayLine = {
        batting: seat ? seat.batting : p.batting,
        pitching: seat ? seat.pitching : p.pitching,
        // A projected day cannot say how many appearances it is, `chances`
        // being a fraction of one, so a league scoring `GP` or `GS` gets
        // nothing here rather than a rounded guess.
        games: 0,
        starts: 0,
      };
      if (!anyPlay(line)) continue;
      out.push({
        key: p.key,
        id: p.id,
        name: nameOf.get(p.id) ?? `#${p.id}`,
        kind: p.kind,
        line,
        value: dayValue(p.kind, line, categories).total,
      });
    }
    return out;
  };

  const todayPerf = useMemo(
    () => scorePlayed(today, dates.today, todayLineup),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, dates.today, todayLineup, categories],
  );
  const yesterdayPerf = useMemo(
    () => scorePlayed(yesterday, dates.yesterday, yesterdayLineup),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yesterday, dates.yesterday, yesterdayLineup, categories],
  );

  /** The reader's own matchup this period, found the way the Roster's own
   *  `Matchup` button finds it — a board row carrying his team id on either
   *  side. A **bye** is found here like any other, ESPN publishing one as a
   *  matchup with no away side, and `MatchupCard` draws its own bye shape. */
  const myTeamId = board?.myTeamId ?? null;
  const mine = useMemo(() => {
    if (!board || myTeamId == null) return null;
    return (
      board.matchups.find((m) => m.home.teamId === myTeamId || m.away?.teamId === myTeamId) ?? null
    );
  }, [board, myTeamId]);

  /** The board's standings rows, by id — what a card draws a name, a badge and
   *  a record from. Built here rather than threaded, the board being the only
   *  thing that has them and this the only caller on the page. */
  const teams = useMemo(() => {
    const map = new Map<number, EspnStandingsTeam>();
    for (const t of board?.teams ?? []) map.set(t.id, t);
    return map;
  }, [board]);

  /* **`Lineup · 20 of 29` is gone from the card head**, and with it the two
     functions that worked it out — for a played day off ESPN's own lineup, for
     a projected one off the engine's plan.

     It was argued for and the argument was about *arithmetic*: a lineup total
     and a roster total are different numbers, only one of them agrees with the
     scoreboard above, and the head said which. All of that is still true and
     none of it is the reader's question. Three lines of head — the day, the
     date, and a count of men — put the thing a manager came for one line lower
     on a card that is already the second block of the page, to answer something
     nobody standing in front of it was asking. The fact survives where it is
     load-bearing: in this file, and in the ESPN check the document records,
     which is what establishes that these figures agree with the scoreboard at
     all. */

  /**
   * **Today is a projection until the day starts.**
   *
   * A card of noughts under `No games played yet.` is a true statement and a
   * useless one: at nine in the morning the thing a manager wants off the
   * Overview is *what is my day worth*, which is the question the Tomorrow
   * block already answers and the engine that answers it is already in hand. So
   * until the first game on this roster is under way, `TODAY` draws the
   * projection — dashed, muted, tagged `PROJECTED`, exactly as Tomorrow is —
   * and it swaps to the measured reading the moment a game does start.
   *
   * **The test is a game of *this roster's* that is live or final**, which is
   * what `DayLine.games` already counts (`lineOf` puts a scheduled fixture in
   * neither). Not MLB's first pitch of the day, which is a fact about somebody
   * else's afternoon; and not *has anybody had a plate appearance*, which would
   * leave the card projected through the top of the first.
   *
   * **A failed or absent projection falls back to the measured block**, which
   * is the rule that a failure costs its own column and never the request: the
   * noughts are honest, and they are what the card showed before this.
   */
  const todayStarted = todayPerf !== null && todayPerf.some((p) => p.line.games > 0);
  const todayProj = scoreProjected(todayProjection, dates.today);
  const todayIsProjected = todayPerf !== null && !todayStarted && todayProj !== null;

  /**
   * **The three named days as three lookups, keyed by their dates.**
   *
   * They are the days this page has always read on entry and they keep every
   * rule they had; what has changed is that the row is longer than they are, so
   * they are looked up by date rather than by position. `cardsFor` below fills
   * everything else in from the period.
   */
  const named: Record<string, Omit<DayCardData, 'date' | 'lead' | 'word'>> = {
    [dates.yesterday]: {
      performers: yesterdayPerf,
      loading: loadingYesterday,
      projected: false,
    },
    [dates.today]: {
      performers: todayIsProjected ? todayProj : todayPerf,
      // **Two reads behind one card, and one wait.** Until both have answered, a
      // block drawn off either is a block the other may be about to replace —
      // which is the flicker the app's loading discipline exists to prevent, and
      // the only case on this page where a card waits on more than its own read.
      loading: loadingToday || (todayPerf !== null && !todayStarted && loadingTodayProjection),
      projected: todayIsProjected,
    },
    [dates.tomorrow]: {
      performers: scoreProjected(tomorrow, dates.tomorrow),
      loading: loadingTomorrow,
      projected: true,
    },
  };

  /**
   * **The opponent's three days, by the same three rules.**
   *
   * Every decision the reader's own days record holds here unchanged and is not
   * restated: the lineup cut, the projected plan, the played-men filter, and
   * `TODAY` drawing its projection until the day starts. What differs is only
   * whose reports these are — which is a `teamId` on the same two routes.
   *
   * **His day starts when *his* first game does**, not when yours does. Two
   * managers' rosters are two sets of clubs, so a card can be measured on one
   * side of the page and projected on the other for an hour of an afternoon.
   * That reads oddly for a moment and is the truth; the alternative is telling
   * the reader a projection is a result because somebody else's game had
   * started.
   */
  const oppTodayPerf = scorePlayed(oppToday, dates.today, oppTodayLineup);
  const oppTodayStarted = oppTodayPerf !== null && oppTodayPerf.some((p) => p.line.games > 0);
  const oppTodayProj = scoreProjected(oppTodayProjection, dates.today);
  const oppTodayIsProjected = oppTodayPerf !== null && !oppTodayStarted && oppTodayProj !== null;

  const oppNamed: Record<string, Omit<DayCardData, 'date' | 'lead' | 'word'>> = {
    [dates.yesterday]: {
      performers: scorePlayed(oppYesterday, dates.yesterday, oppYesterdayLineup),
      loading: oppLoadingYesterday,
      projected: false,
    },
    [dates.today]: {
      performers: oppTodayIsProjected ? oppTodayProj : oppTodayPerf,
      loading:
        oppLoadingToday || (oppTodayPerf !== null && !oppTodayStarted && oppLoadingTodayProjection),
      projected: oppTodayIsProjected,
    },
    [dates.tomorrow]: {
      performers: scoreProjected(oppTomorrow, dates.tomorrow),
      loading: oppLoadingTomorrow,
      projected: true,
    },
  };

  /**
   * **Every card of the row, from three named days and the rest of the
   * period.**
   *
   * One function called twice, which is the guarantee the two carousels are
   * scored the same way — the same one `DayCarousel`, `DayBlock` and
   * `categoryValue.ts` already make, one level up.
   *
   * The three that were always read are looked up; the others fall to their
   * side of today. **A day before today is played and a day after it is an
   * estimate**, which is the same test `lineOf` and the projected block already
   * turn on, and it needs no clock of its own: `dates.today` is `App`'s
   * baseball day and moves on resume with everything else on this page.
   */
  const cardsFor = (
    lookup: Record<string, Omit<DayCardData, 'date' | 'lead' | 'word'>>,
    ex: ExtraDays,
    lineups: Map<string, Set<string>>,
  ): DayCardData[] =>
    days.map((date) => {
      const word = dayWord(date, dates.today);
      const head = { date, word, lead: word.toUpperCase() };
      const known = lookup[date];
      if (known) return { ...head, ...known };
      if (date < dates.today) {
        return {
          ...head,
          projected: false,
          // **One read for the whole back half of the period.** `/api/report`
          // over a span carries each game's own date and a lineup per date, so
          // every played card of the row comes out of one answer — which is
          // why `ExtraDays.past` is one field rather than a map.
          performers: ex.past ? scorePlayed(ex.past.players, date, lineups.get(date) ?? null) : null,
          /* **A card nobody has asked for yet is a card with an answer
             coming**, and it draws the wait rather than the empty state — which
             would otherwise read `no roster is being read`, a sentence about
             the reader's account rather than about a request that has not gone
             out. The read fires as the row reaches it (`READ_AHEAD`), so the
             ball is only ever drawn on a card in view or one peek from it. */
          loading: ex.pastLoading || !ex.pastSettled,
        };
      }
      return {
        ...head,
        projected: true,
        // …and one read *each* for the forward half, the engine having no
        // per-day breakdown to hand back over a span. See `READ_AHEAD`.
        performers: scoreProjected(ex.future[date] ?? null, date),
        // `undefined` is *not asked yet* and `false` is *answered, one way or
        // the other* — see `ExtraDays.pastSettled`, which is the same
        // distinction where a map cannot make it.
        loading: ex.futureLoading[date] ?? true,
      };
    });

  /** The played span's lineups as sets, once rather than per card. A **missing
   *  date** is *we could not read that day*, not *nobody started* — the block
   *  then counts everybody, which is what the app did before per-day lineups
   *  existed. */
  const lineupsOf = (ex: ExtraDays): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>();
    for (const [d, keys] of Object.entries(ex.past?.lineups ?? {})) m.set(d, new Set(keys));
    return m;
  };

  const cards = cardsFor(named, extra, lineupsOf(extra));
  const oppCards = cardsFor(oppNamed, oppExtra, lineupsOf(oppExtra));
  /** **Today is the one the row opens on**, and the index is looked up rather
   *  than written, so a period that starts today and one that started a
   *  fortnight ago both open where the reader is. */
  const opensOn = Math.max(0, days.indexOf(dates.today));

  /**
   * **Which card's whole ranked list is open**, held as a *date* rather than as
   * the card itself — so the dialog follows the day it is about exactly as the
   * card behind it does. `TODAY`'s twenty-second tick rewrites the performers,
   * and a dialog holding the card it was opened with would go on printing the
   * afternoon it opened at while the card underneath moved on.
   */
  const [ranked, setRanked] = useState<{ date: string; opp: boolean } | null>(null);
  const rankedCard = ranked
    ? ((ranked.opp ? oppCards : cards).find((c) => c.date === ranked.date) ?? null)
    : null;

  /**
   * **The page arrives all at once, or not at all.**
   *
   * It is a composition of up to nine reads and it used to draw each of them
   * the moment it had it. From a chair that is six reflows to reach one page:
   * the matchup card lands and the headings below it are pushed down; the three
   * day cards swap their own waits for figures one at a time, each a different
   * height, resizing the carousel under a finger that may already be dragging
   * it; and then the board answers and `Their days` appears out of nothing,
   * growing the page by a whole second carousel. Nothing about that was a bug
   * in any one block — every one of them was keeping rule 2 correctly, that a
   * block wait belongs where there is nothing to show yet.
   *
   * **The unit was wrong.** Three cards of one row are not three panes, and a
   * heading that appears a beat after the block it names is not one either.
   * `ready` asks the question at the size of the thing a reader is actually
   * looking at, and what the reader gets is a wait and then a page.
   *
   * **`lg`, and it is the second place in the app that takes it.** The other is
   * the boot splash, and for the same reason: this wait owns the entire view
   * with nothing behind it to protect, and at 28px a ball with that much room
   * around it reads as a pane still arriving rather than as the page being
   * read.
   *
   * **`WAIT_DELAY` before the ball and nothing before that** — rule 2's second
   * half, and it matters more here than anywhere else in the app, because a
   * gate this wide is one every warm load clears in tens of milliseconds. The
   * *content* stays gated on `ready` itself, never on the delayed flag, or a
   * fast load would show an empty page for a quarter of a second instead of
   * showing the page.
   *
   * **The per-card waits stay** and are not dead. They are what a re-read
   * draws — a card whose day has rolled over on resume, which is a block with
   * genuinely nothing in it under headings that are already on screen, which is
   * exactly the case `md` and `LoadingBlock` were written for.
   */
  if (!ready) {
    return (
      <div className="overview-view overview-wait">
        {showWait ? <LoadingBlock size="lg">Reading your days</LoadingBlock> : null}
      </div>
    );
  }

  return (
    <div className="overview-view">
      {/* **The matchup block is absent rather than empty without a league**, the
          app's own rule for a mark that would have nothing behind it: a heading
          reading `Your matchup` over a message saying there isn't one is chrome
          for a feature the reader hasn't got, and the three day blocks below it
          are a whole page on their own. */}
      {connected && mine ? (
        <section className="ov-matchup">
          <h2 className="ov-heading">
            Your matchup
            {board?.start && board?.end ? (
              <span className="ov-heading-note">
                {board.live ? 'through' : 'final ·'} {prettyGameDate(board.end)}
              </span>
            ) : null}
          </h2>
          <MatchupCard
            matchup={mine}
            categories={board!.categories}
            teams={teams}
            myTeamId={myTeamId}
            format={board!.format}
            live={board!.live}
            /* Neither the label nor the accent border: this is the only card
               on the page, so a mark saying *which one is yours* marks nothing
               — see `markMine`, where that rule and the reversal it records
               live. */
            markMine={false}
            onOpen={onOpenMatchup}
          />
        </section>
      ) : null}

      {/* **A heading of its own, beside the matchup's.** The block had none —
          the three cards each name their day, so the section looked like it was
          already saying what it was. As a carousel it is not: one card is on
          screen and the other two are 22px of edge, so the page went from a
          labeled block to an unlabeled one that happened to begin with the word
          `TODAY`. The heading is the section's name where the card heads are
          the items' — the same split `Your matchup` makes above it.

          **The note is the span**, which is the one fact a carousel takes away:
          with only the middle card in view, nothing on screen says the row
          reaches back to yesterday and on to tomorrow. Same shape as the
          matchup heading's `through Aug 25` an inch above. */}
      <h2 className="ov-heading">
        Your days
        {/* **The note is the span**, which is the one fact a carousel takes
            away — and it is the row's own two ends rather than the three days
            it used to be, a period being what the row now reaches across. */}
        <span className="ov-heading-note">
          {prettyDate(days[0])} – {prettyDate(days[days.length - 1])}
        </span>
      </h2>
      <DayCarousel
        cards={cards}
        days={days}
        opensOn={opensOn}
        onNeed={onNeedDay}
        categories={categories}
        categoriesTitle={categoriesTitle}
        onOpenPlayer={onOpenPlayer}
        onSeeDay={onSeeDay}
        onRankDay={(c) => setRanked({ date: c.date, opp: false })}
        label="Your days — every day of this matchup"
      />

      {/* **And the same three days for whoever you are playing**, at the foot
          of the page.

          It is the second half of the question the first block asks. A matchup
          card says you are down five categories to four; *why* is two rosters,
          and the page held one of them. The three cards are the same cards —
          one `DayCarousel`, one `DayBlock`, one scoring function — read for the
          other manager, which is the same thing `LeagueTeam` does one page over
          and for the same reason: the app already knows how to draw a day, and
          whose day it is is a parameter.

          **Absent rather than empty**, on all three of the ways it can have no
          subject: no league, no matchup this period, or a **bye** — where the
          reader has a matchup and no opponent in it. A heading over a message
          saying there is nobody to compare with is chrome for a week that
          hasn't got one, and the page above it is whole without this.

          **`See the day` is drawn on these cards now**, which reverses what this
          note used to say and is worth the whole paragraph, because what changed
          is not the button.

          It said: *the door it opens is the Roster view, which is yours — a
          press that promised somebody else's Tuesday and delivered your own
          would be worse than no press at all; the matchup page is where a
          leaguemate's roster is read.* Every word of that was true, and it was
          an argument about the **destination** rather than about the card. The
          Roster view has an `Opponent` switch now (`App.tsx`'s `rosterOpp`), so
          the destination can be about him — the same table, the same day, his
          players — and the foot that could not be drawn is the foot this block
          most wanted: a card that says his Tuesday came to 7 runs and three
          homers, with a press that answers *which of his men*.

          It is the same `onSeeDay` and the same button; what differs is where
          it lands (`onSeeOppDay`), and its `title`, which names him rather than
          the categories — the categories being the more useful fact on your own
          cards and the *whose* being the one here. */}
      {opponentName !== null && (
        <>
          <h2 className="ov-heading">
            Their days
            <span className="ov-heading-note">{opponentName}</span>
          </h2>
          <DayCarousel
            cards={oppCards}
            days={days}
            opensOn={opensOn}
            onNeed={onNeedOppDay}
            categories={categories}
            categoriesTitle={categoriesTitle}
            onOpenPlayer={onOpenPlayer}
            onSeeDay={onSeeOppDay}
            onRankDay={(c) => setRanked({ date: c.date, opp: true })}
            /* `possessive`, not `+ "’s"`: half this league's names end in an
               `s` and `Baldy's Bozos’s` reads as a typo — the same rule and the
               same function a slot chip's title on his page already takes. */
            seeDayTitle={`Read ${possessive(opponentName)} roster over this day`}
            label={`${opponentName} — every day of this matchup`}
          />
        </>
      )}
      {/* **Last on the page**, under both sets of days, and that is the order
          the page has always run in: the reader's own week, then his
          opponent's, then the league's. It is the only block here that is not
          about a roster at all, so it is the one a reader scrolls to rather
          than lands on. */}
      {/* **Trending leads the switch**, which is the order a manager reads the
          two in: *what has everybody else decided* is the cheaper question and
          the one that arrives first, and *what does the projection say* is the
          one you check it against. It is also the earlier of the two to land —
          the value rail waits on two board reads, the biggest thing this page
          asks for — so the tab a reader arrives on is the tab that is ready. */}
      <SpotlightSection
        trending={trending}
        highValue={highValue}
        tab={spotlight}
        onTab={onSpotlight}
        onWindow={onSpotWindow}
        valueReading={valueReading}
        onValueReading={onValueReading}
        onOpenPlayer={onOpenPlayer}
        onSeeMore={onSeeMore}
      />
      {/* **The whole of a day, ranked, over the page** — see
          `RankedDayDialog`. It is raised here rather than inside a carousel so
          the two rows share one box: there is one of these open at a time, and
          which row it came from is two characters of state rather than a second
          dialog that would have to agree with the first. */}
      {rankedCard && (
        <RankedDayDialog
          card={rankedCard}
          who={ranked?.opp ? opponentName : null}
          categories={categories}
          categoriesTitle={categoriesTitle}
          onOpenPlayer={onOpenPlayer}
          onClose={() => setRanked(null)}
        />
      )}
    </div>
  );
}

export type { Performer };
