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
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  EspnCategory,
  EspnScoreboard,
  EspnStandingsTeam,
  PlayerKind,
  PlayerReport,
  ProjectedPlayerLine,
  RosterProjection,
  SeasonPlayer,
  TrendWindow,
} from '../types';
import { playerKey } from '../types';
import type { OverviewSliceKey } from '../types';
import { categoryTotal, dayValue, STANDARD_5X5 } from '../categoryValue';
import type { DayLine } from '../categoryValue';
import {
  combineLines,
  combinePitchingLines,
  formatIp,
  headshotUrl,
  possessive,
  prettyDate,
  prettyGameDate,
  surname,
} from '../lib';
// The board's own two, imported rather than written again: the trending cards
// print the same fact its `Δ` columns do, and one presentation of a signed move
// is one place for it to be decided.
import { formatTrend, trendDirection } from './researchColumns';
import { rankFill } from './columnRanks';
import { LoadingBlock } from './Loading';
import { Modal } from './Modal';
import { useOverflowArrows } from './TabStrip';
import { MatchupCard, TeamLogo, categoryGroups, fmtValue } from './LeagueView';
import { ProjectedGlyph } from './Projection';

/** How many men a day block names. Three, and the number is the block's own
 *  height rather than a taste: a day card carries a head, two category rows and
 *  a list, and three rows is what fits beside the other two blocks at 1200
 *  without either the card or the page scrolling. A fourth is one press away —
 *  the whole roster's day is the Roster view with the date set to that day,
 *  which is where the `See the day →` foot goes. */
const TOP_N = 3;

/**
 * **The three days, in the order they happened.**
 *
 * They were drawn `Today · Yesterday · Tomorrow` — the order a manager *asks*
 * after them — and that reads as a list where the row is a **carousel**, whose
 * whole grammar is that left is back and right is forward. Chronological is
 * what a swipe means, and it costs nothing: the row opens on `Today` (below),
 * so what leads is unchanged and what has moved is where the other two are. It
 * reads the same way on a desk, where left-to-right through three columns is a
 * timeline rather than a ranking.
 */
const DAYS = ['yesterday', 'today', 'tomorrow'] as const;
type DayKey = (typeof DAYS)[number];

/** **Today is the one the row opens on**, and the index is derived from the
 *  array rather than written as `1`, so re-ordering `DAYS` cannot leave the
 *  opening card behind. */
const OPENS_ON = DAYS.indexOf('today');

/** Title case, for the dots' own labels — the card heads are small caps. */
const DAY_WORD: Record<DayKey, string> = {
  yesterday: 'Yesterday',
  today: 'Today',
  tomorrow: 'Tomorrow',
};

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
 * **A played day, in the league's own categories, behind the line that produced
 * them.**
 *
 * Reported as *"for batters/pitchers on the matchup leaders section of the
 * overview page, it should show the fantasy categories (R, HR, RBI, SB, OPS)
 * and (K, W, ERA, WHIP, SVHD). For batters it should show H/AB first, and for
 * pitchers it should show IP, H, BB first."*
 *
 * **It settles an argument this file had already had once, on the other row.**
 * `projSummary` below was a fixed phrase until the same objection was made of
 * it — *plate appearances are not a category* — and it became
 * `categoryGroups`' own set in `categoryGroups`' own order, so the eye carries
 * from `HR 1.7` on the block's header line to the `0.2 HR` that is this man's
 * share of it. The **measured** row kept a box-score line and so kept the
 * mismatch: a card headed `R HR RBI SB OPS` printing `6.0 IP, 3 H, 0 R, 0 ER,
 * 2 BB, 7 K` under it answers a question the block is not asking. The two
 * readings of one row now differ in the *numbers* and not in *which* numbers,
 * which is the split a `Summary`/`Projected` switch is supposed to be.
 *
 * **The line still leads, because a result is a result.** The old note here was
 * right that a played day has a form every reader of a box score knows, and
 * wrong that the form is the whole row. So the terms that are *not* categories
 * and are still what a manager reads first survive in front: `H-AB` for a
 * batter, `IP, H, BB` for a pitcher — the three a pitching line is identified
 * by and the two that WHIP is made of, which is what lets a `1.000 WHIP`
 * further along the row be checked rather than taken.
 *
 * **`R` and `ER` are gone from the front and that is the point.** ER is what
 * ERA is made of and ERA is the category; R differs from it only where an error
 * has come into it, which is a fact for a box score rather than for a row whose
 * job is to say why this man is first today.
 *
 * **A lead term the league happens to score is not printed twice.** A league
 * scoring hits allowed or walks gets them once, in the category run, where they
 * are what is being scored — the dedupe is on `statId`, so it is right for a
 * league this file has never seen.
 *
 * **Only a decision he earned is printed.** `0 W, 0 SVHD` spends two terms
 * saying nothing happened, and unlike a nought in `R` it is not a nought a
 * reader is comparing against anything — a decision is a thing that either
 * occurred or did not. Every other category prints at nought, including
 * `0 R`: those *are* being compared down the list, and a line that silently
 * omitted them would leave the reader counting commas. The two decision sets
 * are `projSummary`'s own, so a league scoring `SV` and `HD` separately is
 * covered without a test on `SVHD`.
 *
 * A **loss** is the one decision that cannot be drawn whatever the league
 * scores: `PitchingLine` carries `wins`, `saves` and `holds` and no losses —
 * the boxscore credit this app stores has never included them — so a league
 * scoring `L` gets `0 L` from `categoryTotal` and it is dropped as a decision
 * nobody earned. Nothing is invented in its place.
 */
function playedSummary(
  kind: 'batter' | 'pitcher',
  line: DayLine,
  categories: EspnCategory[],
): string {
  const side = kind === 'pitcher' ? 'pitching' : 'batting';
  const group = categoryGroups(categories).find((g) => g.side === side);
  const scored = new Set((group?.categories ?? []).map((c) => c.statId));
  const lead: string[] = [];
  if (kind === 'pitcher') {
    const p = line.pitching;
    if (!p) return '—';
    if (!scored.has(34)) lead.push(`${formatIp(p.outs)} IP`);
    if (!scored.has(37)) lead.push(`${p.hits} H`);
    if (!scored.has(39)) lead.push(`${p.walks} BB`);
  } else {
    const b = line.batting;
    if (!b) return '—';
    lead.push(`${b.hits}-${b.ab}`);
  }
  const cats = (group?.categories ?? [])
    .map((c) => ({ c, v: categoryTotal(c, line) }))
    .filter(({ c, v }) => !(DECISIONS.has(c.statId) && !v))
    .map(({ c, v }) => `${fmtValue(v ?? undefined, c)} ${c.label}`);
  const parts = [...lead, ...cats];
  return parts.length > 0 ? parts.join(', ') : '—';
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
/** Both of them, for the played row — which drops a decision on whether it was
 *  *earned* rather than on which role could have earned it. See
 *  `playedSummary`. */
const DECISIONS = new Set([...STARTER_DECISIONS, ...RELIEF_DECISIONS]);

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
  fill,
}: {
  rank: number;
  p: Performer;
  projected: boolean;
  /** The league's own, for a projected row — which prints them rather than a
   *  phrase of this file's choosing. */
  categories: EspnCategory[];
  onOpenPlayer: (id: number) => void;
  /**
   * **A chip under the value, on a diverging scale across the whole matchup**
   * — `columnRanks.tsx::rankFill`'s own `--rank-bg`, red at the top of the
   * population and blue at the bottom, plain neutral through the middle.
   * Undefined on the day cards, which draw no chip at all.
   *
   * That split is the app's rule rather than an inconsistency. *Color is spent
   * on state, not on emphasis*: on a card of **three** rows the order is
   * already the whole reading, and a scale down three rows would be the ranking
   * said twice. In a list of **twenty-three**, ranked against forty-five across
   * both rosters, the scale genuinely *is* a reading the order cannot give —
   * whether the man ninth on your side would be third on theirs — which is
   * exactly the argument the League rankings' own badge is drawn on.
   */
  fill?: CSSProperties;
}) {
  /* **Two readings of one row, differing in the numbers and not in which
     numbers.** Both are the league's own categories in `categoryGroups`' order;
     `projSummary` prints an expectation to a tenth and drops the decision the
     man's projected role cannot earn, `playedSummary` prints what happened
     behind the line that produced it and drops the decision he did not get.
     `lib.ts::lineSummary` is not called from here any more, and its
     `strikeouts: false` option went with this its last reader — the note on
     *why* it existed is kept there, the feed and the player card going on with
     the default it always had. */
  const summary = projected
    ? projSummary(p.kind, p.line, categories)
    : playedSummary(p.kind, p.line, categories);
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
        className={`ov-perf-val${projected ? ' is-proj' : ''}${fill ? ' is-chip' : ''}`}
        style={fill}
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
 * Written once because it is read twice — the card takes the first three of it
 * and the dialog behind `Rank all N` takes the lot — and two copies of a filter
 * are two copies that will one day disagree about who is on the board. Both
 * halves matter:
 *
 * **The list is of men who *played*, which is a filter the totals do not
 * take.** A man in the lineup whose club was idle contributes 0 to every
 * counting category and nothing at all to the rates, so counting him in the
 * day's figures is right and costs nothing — and ranking him is not: a score of
 * exactly `+0.0` for having done nothing sorts **above** a man who went
 * 0-for-4, whose OPS contribution is genuinely negative.
 *
 * Found at 4am ET the morning after this page shipped, which is the hour that
 * makes it visible: the baseball day had rolled to a card with no games played
 * on it, and `TODAY` listed three men at `0-0` and `+0.0` under a category line
 * of noughts — where the block has a sentence for exactly that state and was one
 * empty list away from saying it.
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
 * One of the three day blocks.
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
  settled,
  onVisible,
  onOpenPlayer,
  onSeeDay,
  seeDayTitle,
  onRankAll,
}: {
  /** `TODAY`, `YESTERDAY`, `TOMORROW` — the qualifier over the date, which is
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
  /**
   * **This card's slice has answered.** False draws the shimmer — the card's
   * own chrome with bars where the figures go — which is what a card looks like
   * before its data has been asked for *and* while it is in flight, those being
   * the same thing from the reader's chair.
   *
   * Distinct from `loading`, which is the re-read case: a card that has an
   * answer and is getting a new one keeps the old on screen (rule 1) and only
   * the per-card `LoadingBlock` may show, on the day a rollover empties it.
   */
  settled: boolean;
  /** Fires when half of the card is on screen — see `useOnVisible`. */
  onVisible: () => void;
}) {
  const watch = useOnVisible(onVisible, { threshold: 0.5, off: settled });
  const total = useMemo(
    () => addLines((performers ?? []).map((p) => p.line)),
    [performers],
  );
  /** Everybody the day ranks, and the three the card has room for — see
   *  `rankDay`, which is the one place the filter and the sort are stated. */
  const all = useMemo(() => rankDay(performers, projected), [performers, projected]);
  const top = all.slice(0, TOP_N);

  // **The shimmer is the card, not a box in place of it.** A skeleton that
  // replaced the whole section would be a different height from the card it
  // stands for, and the reflow it caused on arrival is the thing the page-wide
  // wait was built to avoid. `SkeletonDay` is built from these same classes, so
  // the swap is figures appearing in boxes that were already the right size.
  if (!settled) {
    return (
      <SkeletonDay
        lead={lead}
        date={date}
        categories={categories}
        projected={projected}
        sectionRef={watch}
      />
    );
  }

  return (
    <section ref={watch} className={projected ? 'ov-day ov-day-proj' : 'ov-day'}>
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
          <LoadingBlock>Reading your {lead.toLowerCase()}</LoadingBlock>
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
              {projected
                ? `Nobody in ${lead.toLowerCase()}’s lineup has a game to play.`
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
                  /* The heading's own sentence with the count in front of it —
                     `Ranked over your league's 10 categories — R · HR · …` is
                     exactly what this list is, and it is already written once
                     for the three rows above. */
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
 * and it is the wrong press for this question. The Roster view answers *what did
 * each of my men do*: a wide table of stat columns in roster order, on another
 * view, with the date bar moved. **Who was fourth** is this list with more of it
 * — the same rows, the same arithmetic, the same order — and asking it should
 * not cost the reader the page they are on.
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
function RankedDialog({
  subject,
  span,
  projected,
  performers,
  who,
  whoTeam,
  pool,
  heat,
  categories,
  categoriesTitle,
  onOpenPlayer,
  onClose,
}: {
  /** What the list is of, in the title's own voice — `Today, Aug 28` off a day
   *  card, `Aug 24 – Aug 28` off the matchup block. Title case, the card heads
   *  being small caps and a dialog title a sentence. */
  subject: string;
  /** **True where the list is a range of days rather than one**, which changes
   *  exactly one thing: what the sentence under it calls a man who did not
   *  play. A day names the cause (*he had no game*); a fortnight cannot, a man
   *  benched all week and a man whose club was idle all week being the same
   *  empty line. */
  span: boolean;
  projected: boolean;
  performers: Performer[] | null;
  /**
   * **Whose list it is**, where that is not simply *the reader's own day*.
   *
   * Null draws neither name nor badge and leaves the subject alone on one line.
   * **Only a reader with no league passes it now.** It used to be what your own
   * day card passed — on the argument that the box is about you by
   * construction, and that a mark which would be on every row marks nothing,
   * the same rule that suppresses `Your matchup`'s tag on the card at the top
   * of this page. That rule is about a mark inside a list; this is the head of
   * a box, and two of these boxes are opened one after the other on a page
   * whose whole reading is *which of us*. Both blocks name both sides, so the
   * two dialogs a manager opens in a row are told apart by the same crest they
   * already know off the scoreboard card.
   */
  who: string | null;
  /** His row off the board, for the badge beside the name. `TeamLogo` draws the
   *  app's own baseball where there is no logo or the URL is dead, which on a
   *  real league is the ordinary case. */
  whoTeam?: EspnStandingsTeam;
  /**
   * **Every value in the matchup, both rosters**, which is the population the
   * chip under each value is ranked against — see `PerformerRow`'s `fill`.
   *
   * Both sides rather than this one, and it is the whole point of the mark: a
   * list of your own men ranked against your own men says only what the order
   * already says. Ranked against the forty-odd on the two rosters, the chip
   * answers the question the block exists for — is my ninth-best week better
   * than his third.
   */
  pool: number[];
  /**
   * **One of the three counts, opened.** Undefined is the whole list, which is
   * what a `Rank all N` press passes; a `Heat` narrows it to the men that badge
   * counts and says so in the label over the rows.
   *
   * **The chips do not change with it.** The scale is `pool`'s — every value in
   * the matchup on both rosters — so a hot man's chip is the same red whether
   * he is read among the nine or among the forty-five, which is what makes the
   * cut a *filter* rather than a second ranking.
   */
  heat?: Heat;
  categories: EspnCategory[];
  categoriesTitle: string;
  onOpenPlayer: (id: number) => void;
  onClose: () => void;
}) {
  /** Everybody the list ranks, and — where a badge was pressed — the men that
   *  badge counts. `heatOf` is the same function the badge's own number is made
   *  of, so the cut and the count cannot come to disagree. */
  const ranked = useMemo(() => rankDay(performers, projected), [performers, projected]);
  const all = useMemo(
    () => (heat ? ranked.filter((p) => heatOf(p, projected) === heat) : ranked),
    [ranked, heat, projected],
  );
  /** Descending, so a rank is a count of what is strictly above plus one — the
   *  **competition** convention `columnRanks.tsx::rankOf` and `espn.ts::rankAll`
   *  already use, where two men level for 4th are both 4th. */
  const sorted = useMemo(() => [...pool].sort((a, b) => b - a), [pool]);
  const rankIn = (v: number): number => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] > v) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
  /**
   * **The two ways a man in the lineup is not on the list**, counted apart
   * because they are different facts about him and the card has room for
   * neither. A day that ranks nine of eleven should say what the other two
   * were — the app's own rule that an empty state names its own cause, applied
   * to the part of a list that is missing rather than to the whole of one.
   */
  const scorable = (performers ?? []).filter((p) => projected || anyPlay(p.line));
  const idle = (performers?.length ?? 0) - scorable.length;
  const unscored = scorable.length - ranked.length;

  return (
    <Modal
      /* **The name over the days, with the badge beside it**, where the three
         were one line reading `Baldy's Bozos — Aug 28 – Sep 6 ↗ PROJECTED`.

         They are not three things of equal weight held apart by a dash. The
         name is *whose list this is* and the dates are *what it is over*, which
         is the same relationship the day cards' own heads draw and draw the
         same way — a lead over a date, one above the other. A dialog title that
         has to be parsed left to right for the subject is a title doing a
         sentence's job.

         And the badge is what makes it legible at a glance on a page with two
         of these open one after the other: a fantasy team name is chosen by its
         manager and half of them are jokes, where the picture is the thing the
         reader already recognises off the scoreboard card at the top of the
         page. Where there is no name there is no line and no badge, and the
         subject stands where it always did. */
      title={
        who ? (
          <span className="ov-ranked-title">
            <TeamLogo team={whoTeam} />
            <span className="ov-ranked-title-body">
              <span className="ov-ranked-who">{who}</span>
              <span className="ov-ranked-sub">
                {subject}
                {projected ? (
                  <span className="ov-day-proj-tag">
                    <ProjectedGlyph size={12} /> PROJECTED
                  </span>
                ) : null}
              </span>
            </span>
          </span>
        ) : (
          <>
            {subject}
            {projected ? (
              <span className="ov-day-proj-tag">
                <ProjectedGlyph size={12} /> PROJECTED
              </span>
            ) : null}
          </>
        )
      }
      titleId="ov-ranked-title"
      className="ov-ranked-box"
      onClose={onClose}
    >
      {/* **The day's category totals are not in here, and they were.**

          The dialog opened with the card's own `.lg-cats` line at the head of
          it, on the argument that a box opened *out of* a card should read as
          more of that card rather than as a second opinion about the day. That
          argument is about *continuity*, and it was answering a question nobody
          asked this box: the totals are on the card the press came from, four
          lines up and still on the page behind this one.

          What this box is for is the **list** — the three rows the card had room
          for, and the rest. A ten-column block above them spent the top of a
          phone-height dialog on a figure the reader had just read, put the first
          rank 150px down a 460px box, and, once the list was scrolled, left a
          row of category labels sliced through the middle under the fixed head.
          So the list starts at the top, and the head above it names the day —
          the only thing about *this* day the rows do not say for themselves. */}
      <div className="ov-perfs-head-row">
        {/* **The label says which cut is open**, and it says it in the badge's
            own words: `🥵 5 hot` where a whole list says `22 ranked`. The glyph
            is what the reader pressed, so it is what says where they are. */}
        <h4 className="ov-perfs-head" title={categoriesTitle}>
          {heat ? (
            <>
              <span aria-hidden="true">{HEAT_MARK[heat]}</span> {all.length} {HEAT_WORD[heat]}
            </>
          ) : (
            `${all.length} ranked`
          )}
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
              projected={projected}
              categories={categories}
              onOpenPlayer={onOpenPlayer}
              fill={p.value === null ? undefined : rankFill(rankIn(p.value), sorted.length)}
            />
          </li>
        ))}
      </ol>
      {/* **The two sentences are about the whole population**, so a cut does not
          draw them: `14 more in the lineup had no game` under a list of the five
          hot men is a sentence about a list nobody is looking at. */}
      {!heat && idle > 0 && (
        <p className="ov-day-empty">
          {idle} more in the lineup{' '}
          {span ? 'did not play.' : projected ? 'have no game to play.' : 'had no game.'}
        </p>
      )}
      {!heat && unscored > 0 && (
        <p className="ov-day-empty">
          {unscored} more {unscored === 1 ? 'is' : 'are'} unranked — your league scores nothing this
          table can compute on {unscored === 1 ? 'his' : 'their'} side of the ball.
        </p>
      )}
    </Modal>
  );
}

/* ---- The matchup so far --------------------------------------------------- */

/**
 * **A span of played days as one answer**, which is what `/api/report` hands
 * back over a range: every game with its own date on it, and a lineup per date.
 * Mirrors `App.tsx::OverviewSpan`.
 */
export interface MatchupReport {
  players: PlayerReport[];
  /** By date. A **missing** date is *we could not read that day*, not *nobody
   *  started* — the day is then scored over everybody, which is what the app
   *  did before per-day lineups existed. */
  lineups: Record<string, string[]> | null;
}

/**
 * **One man's whole matchup, as the same `Performer` a day card ranks.**
 *
 * **Cut by the lineup that was set for each day**, one day at a time, which is
 * the whole reason this is a loop: ESPN banks a man only on the periods he held
 * a starting slot for, and a week's lineup is seven different lineups. It is
 * `projectStarters`'s two-tier rule with the days in hand rather than
 * estimated. A day he did not play adds nothing and is not in the line, so what
 * this returns is *what he did while started* — which is what the row under his
 * name prints, and what `line.games` counts.
 *
 * **The value is one call on the summed line, and it is the sum of his days by
 * arithmetic rather than by luck.** `dayValue` divides by the standard
 * deviation of a **single player-day**, so a week's figure is a week's worth of
 * player-days and `+5.0` here means the same thing about a day as `+1.0` does
 * on a day card. It is the same number either way because **every contribution
 * is linear in the counts**: a counting category is his count, and a rate
 * category is *numerator above baseline* — `H − lgAVG × AB`,
 * `lgERA × IP / 9 − ER` — which sums over days to the same expression on the
 * totals. (Written as a loop first, adding a `dayValue` per day; the two agreed
 * to the last place, which is what says the shortcut is one.)
 */
function spanPerformer(
  report: PlayerReport,
  days: string[],
  lineups: Map<string, Set<string>>,
  categories: EspnCategory[],
): Performer {
  const key = playerKey(report);
  const lines: DayLine[] = [];
  for (const day of days) {
    const lineup = lineups.get(day);
    if (lineup && !lineup.has(key)) continue;
    const line = lineOf(report, day);
    if (anyPlay(line)) lines.push(line);
  }
  const line = addLines(lines);
  return {
    key,
    id: report.id,
    name: report.name,
    kind: report.kind,
    line,
    value: dayValue(report.kind, line, categories).total,
  };
}

/**
 * **The same man over the days the matchup has left**, off the projection
 * engine rather than off a report.
 *
 * **The lineup is the engine's own plan**, which is the only lineup a day
 * nobody has played can have: `ProjectedPlayerLine.lineup` is what it would
 * start him for over the span, and `days.length` is how many appearances that
 * is — the divisor the hot-and-cold reading needs and the one figure a
 * projected line does not otherwise carry. A man it would bench every day has
 * an empty plan and is not in the block, which is the same cut the played side
 * makes.
 *
 * **The value is the span undivided**, exactly as the summary side's is, so the
 * two readings of this card are the same figure over different days rather than
 * two arithmetics sharing a column heading.
 */
function projectedSpanPerformer(
  p: ProjectedPlayerLine,
  name: string,
  categories: EspnCategory[],
): Performer {
  const seat = p.lineup;
  const line: DayLine = {
    batting: seat ? seat.batting : p.batting,
    pitching: seat ? seat.pitching : p.pitching,
    games: seat ? seat.days.length : 0,
    starts: 0,
  };
  return {
    key: p.key,
    id: p.id,
    name,
    kind: p.kind,
    line,
    value: dayValue(p.kind, line, categories).total,
  };
}

/**
 * **Hot, cold, or neither** — a count of each, per side, over the men the block
 * ranks.
 *
 * **The reading is value *per appearance*, not the total.** A total says who
 * has given the most, which is what the three rows above already say and what
 * `Rank all` opens; *hot* is a question about form, and a man who has played
 * six days and one who has played two are not comparable until the days are
 * divided out. `line.games` is that divisor on both readings — days started and
 * played on the summary side, days the engine would start him on the projected
 * one.
 *
 * **Two pairs of cuts, one per reading, and both are measured** — because the
 * two distributions are not the same distribution and a single pair leaves one
 * of the three counts firing for nobody.
 *
 * **Played: `+0.50` and `0`.** Measured over both rosters of the live league's
 * matchup (43 men who had played, 5 days): min **−0.52**, p25 **−0.04**, median
 * **+0.14**, p75 **+0.61**, max **+2.80**, mean **+0.35**. It is strongly
 * right-skewed and floors near −0.5, which is a fact about the arithmetic
 * rather than about the week — every counting category contributes zero or
 * more, so the only way down is a rate below the league's and the only way up
 * has no ceiling. A symmetric `±0.5` therefore reads **14 hot, 28 neutral and 1
 * cold**: a category that fires once in forty-three is not a category. At
 * `+0.5 / 0` it is **14 / 17 / 12**, and per side 5/10/7 against 9/7/5 — the
 * shape of a matchup one manager is winning.
 *
 * **Projected: `+0.70` and `+0.35`, and both are positive.** A projection is an
 * *expectation*, so there is no such thing as a negative one: measured over the
 * same two rosters across the ten days the period had left (45 men with an
 * appearance projected), min **+0.135**, p25 **+0.326**, median **+0.451**, p75
 * **+0.706**, max **+1.409**, mean **+0.528**. The played cuts applied here
 * give **cold = 0 on both sides**, which is the very fault the asymmetry above
 * was chosen to avoid, arrived at from the other end. At `0.70 / 0.35` it is
 * **12 / 19 / 14**, the two cuts sitting at that distribution's own quartiles.
 *
 * So *hot* means the same **kind** of thing on both readings — near the top of
 * what this population does per appearance — and deliberately not the same
 * number, the two populations having different floors. The card's own switch
 * says which reading is in force, and the note in the heading says over which
 * days.
 *
 * **The three add up to the door's own count**, both being the men the block
 * ranks — which is what lets the row be read as a breakdown rather than as
 * three unrelated figures.
 */
const HEAT_CUTS = {
  played: { hot: 0.5, cold: 0 },
  projected: { hot: 0.7, cold: 0.35 },
} as const;

type Heat = 'hot' | 'neutral' | 'cold';

function heatOf(p: Performer, projected: boolean): Heat {
  if (p.value === null) return 'neutral';
  const cuts = projected ? HEAT_CUTS.projected : HEAT_CUTS.played;
  const rate = p.value / Math.max(1, p.line.games);
  return rate >= cuts.hot ? 'hot' : rate < cuts.cold ? 'cold' : 'neutral';
}

/** The three counts, in the order the row prints them — best first, which is
 *  the order every other list on this page runs in. */
function heatTally(performers: Performer[], projected: boolean): Record<Heat, number> {
  const out: Record<Heat, number> = { hot: 0, neutral: 0, cold: 0 };
  for (const p of performers) out[heatOf(p, projected)]++;
  return out;
}

/** The mark for each, and it is deliberately three *different kinds* of glyph
 *  rather than three faces: a flame, a bar and a block of ice read as a scale
 *  at 12px where three round faces read as one smudge. */
const HEAT_MARK: Record<Heat, string> = { hot: '🥵', neutral: '😐', cold: '🥶' };
const HEAT_WORD: Record<Heat, string> = { hot: 'hot', neutral: 'neutral', cold: 'cold' };

/**
 * **One side of the matchup block**: whose men they are, the three who have
 * done most for them, and the door onto the rest.
 *
 * It is `DayBlock`'s own three rows — `.ov-perfs-head-row`, `.ov-perfs`,
 * `PerformerRow` — rather than a second list that agrees with them today. What
 * it is not is a `DayBlock`: that component's head is a *day*, its body is a
 * category line and its states are four mornings, none of which this has.
 */
/**
 * One manager's half of `Matchup leaders`, with its figures missing.
 *
 * Same rule as `SkeletonDay`: built from `.ov-leader-side`'s own classes so the
 * two columns are the height they will be, and only the things the read answers
 * with are bars. The crest and the manager's name are bars too, unlike a day
 * card's head — a day card's lead and date are facts the app already holds,
 * where whose block this is comes off the same board read that fills it.
 *
 * Three rows and three heat cells, which are `TOP_N` and the three cuts the
 * real block always draws.
 */
function SkeletonLeaderSide() {
  return (
    <div className="ov-leader-side">
      <div className="ov-leader-head">
        <span className="lg-logo sk-bar sk-crest" />
        <h4 className="ov-perfs-head ov-leader-name sk-leader-name">
          <SkBar w="100%" />
        </h4>
      </div>
      <div className="ov-perfs-head-row">
        <span className="ov-perfs-head">Top Performers</span>
        <span className="ov-perfs-val-head">VALUE</span>
      </div>
      <ol className="ov-perfs">
        {Array.from({ length: TOP_N }, (_, i) => (
          <li key={i}>
            <span className="ov-perf sk-perf">
              <span className="ov-perf-rank">{i + 1}</span>
              <span className="ov-perf-face sk-bar" />
              <span className="ov-perf-body">
                <span className="ov-perf-name">
                  <SkBar w={['58%', '44%', '51%'][i] ?? '52%'} />
                </span>
                <span className="ov-perf-line">
                  <SkBar w={['84%', '70%', '78%'][i] ?? '78%'} />
                </span>
              </span>
              <span className="ov-perf-val">
                <SkBar w="34px" />
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="ov-heat">
        {['🥵', '😐', '🥶'].map((glyph) => (
          <span className="ov-heat-cell sk-door" key={glyph}>
            <SkBar w="60%" />
          </span>
        ))}
      </p>
      <footer className="ov-day-foot">
        <span className="ov-day-more sk-door">
          <SkBar w="56%" />
        </span>
      </footer>
    </div>
  );
}

function LeaderSide({
  name,
  team,
  performers,
  loading,
  settled,
  projected,
  categoriesTitle,
  categories,
  onOpenPlayer,
  onRankAll,
}: {
  name: string;
  /** His row off the board, for the crest beside the name — `TeamLogo` draws the
   *  app's own baseball where there is no logo or the URL is dead, which on a
   *  real league is the ordinary case rather than the exception. */
  team: EspnStandingsTeam | undefined;
  /** Null is *not answered yet*; an empty array is *answered, and nobody* — the
   *  two are drawn differently, which is the whole of why this is nullable. */
  performers: Performer[] | null;
  loading: boolean;
  /** This side's span has answered. False draws the shimmer — the block's own
   *  chrome with bars where the three rows and the heat counts go. */
  settled: boolean;
  projected: boolean;
  categoriesTitle: string;
  categories: EspnCategory[];
  onOpenPlayer: (id: number) => void;
  /** **The door onto the rest**, with an optional cut. `undefined` is the foot's
   *  own `Rank all N` — everybody; a `Heat` is one of the three badges, which
   *  open the same list narrowed to the men that badge counts. */
  onRankAll: (heat?: Heat) => void;
}) {
  const top = (performers ?? []).slice(0, TOP_N);
  const heat = heatTally(performers ?? [], projected);
  const cuts = projected ? HEAT_CUTS.projected : HEAT_CUTS.played;
  // The shimmer is the block, for the reason it is on a day card: built from
  // `.ov-leader-side`'s own classes, so the two columns are the height they
  // will be and the figures land in boxes that were already right.
  if (!settled) return <SkeletonLeaderSide />;

  return (
    <div className="ov-leader-side">
      {/* **The manager's name gets the line to itself**, where a day card's
          `Top Performers` shares one with the `Value` label.

          It shared that line too, and it was the wrong line to share: a team
          name is not a column heading, it is what the *whole side* is, and half
          this league's are long enough (`Brian&Tom’s Excellent Adventure`) to
          crowd anything put beside them in a 300px column. One line up, it
          reads as the head of the block it heads and the row under it is free
          for the two things that really are headings — what the roster is doing
          and what the numbers down the right are. */}
      {/* **The crest beside the name**, the same pairing the dialog's own head
          makes and the same one the scoreboard card at the top of the page
          makes: a fantasy team name is chosen by its manager and half of them
          are jokes, where the picture is what the reader already recognises. It
          is `TeamLogo` outright — one component, three surfaces, one answer for
          a dead URL. */}
      <div className="ov-leader-head">
        <TeamLogo team={team} />
        <h4 className="ov-perfs-head ov-leader-name" title={categoriesTitle}>
          {name}
        </h4>
      </div>
      {performers === null ? (
        loading ? (
          <LoadingBlock>Reading {projected ? 'the days ahead' : 'the matchup'}</LoadingBlock>
        ) : (
          <p className="ov-day-empty">Nothing to report on.</p>
        )
      ) : (
        <>
          {/* **The same two labels the day cards carry, in the same row.**

              This row held the heat counts on the left and `VALUE` on the right,
              and the counts have gone to the foot (below). What belongs here is
              what belongs here on every other list of performers in this app:
              the name of the list and the name of the column its numbers are in.
              A block that draws the identical three rows under a *different*
              caption is a block a reader has to check is the same thing.

              `Top Performers` is a **span** rather than the day cards' `h4`,
              which is the one difference and is a fact about this card rather
              than about the label: the heading of a side here is the *manager's
              name*, one line up, and a second `h4` under it would have a screen
              reader announce two headings for one list. Same class, same type,
              no `h4`. */}
          {performers.length > 0 ? (
            <div className="ov-perfs-head-row">
              <span className="ov-perfs-head" title={categoriesTitle}>
                Top Performers
              </span>
              <span className="ov-perfs-val-head" title={categoriesTitle}>
                Value
              </span>
            </div>
          ) : null}
          {top.length === 0 ? (
            <p className="ov-day-empty">
              {projected
                ? 'Nobody has a game left in this matchup.'
                : 'Nobody has played a game in this matchup yet.'}
            </p>
          ) : (
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
          )}
          {/* **How the roster is running, at the foot and centered.**

              It is the one thing on this card that is about *all* of them: the
              rows name three men and the door under it counts the rest, and
              neither says whether the twenty behind them are going well. Three
              counts that add up to the door's own number is a shape a reader can
              take in without reading a figure.

              **At the foot rather than at the head**, which is where it was.
              The head of a list is where you say what the list *is*, and these
              are not about the list — they are about the population it was cut
              from, which is what the control immediately under them opens. Read
              downward the card now goes: whose it is, the three who did most,
              the shape of the rest, the door onto the rest. Centered for the
              same reason: it is the only row here that belongs to the whole
              card rather than to a column of it, and a badge row flush left
              under three right-aligned figures reads as a fourth row of the
              list.

              It carries the `margin-top: auto` the foot used to, so a short side
              still puts its last two rows at the bottom — see `.ov-heat`. */}
          {performers.length > 0 && (
            <p
              className="ov-heat"
              /* Off `HEAT_WORD` rather than spelled again, so the three words
                 a screen reader hears and the three the dialog's own label
                 prints cannot come to disagree. */
              aria-label={(['hot', 'neutral', 'cold'] as const)
                .map((k) => `${heat[k]} ${HEAT_WORD[k]}`)
                .join(', ')}
            >
              {/* **Each badge is a door onto its own three.**

                  The foot under them opens the whole list, and the counts were
                  the one thing on the card that named a group the reader could
                  not then look at — *nine of them are hot* with no way to ask
                  *which nine*. It is the same dialog with the same rows in the
                  same order, cut to the men the badge counts, which is what
                  makes it free: `heatOf` is already computing the answer to draw
                  the number.

                  **A count of nought is a badge that does not press.** There is
                  nothing behind it, and a control that opens an empty list is
                  worse than a figure that is plainly a nought — the same rule as
                  a switch with one live option. */}
              {(['hot', 'neutral', 'cold'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={heat[k] === 0 ? 'ov-heat-cell is-none' : 'ov-heat-cell'}
                  disabled={heat[k] === 0}
                  onClick={() => onRankAll(k)}
                  title={`${heat[k]} ${HEAT_WORD[k]} — ${
                    k === 'hot'
                      ? `worth ${cuts.hot.toFixed(2)} standard deviations of a player-day or more per appearance`
                      : k === 'cold'
                        ? `worth under ${cuts.cold.toFixed(2)} per appearance`
                        : 'between the two'
                  }${heat[k] === 0 ? '' : ' — open the list'}`}
                >
                  <span aria-hidden="true">{HEAT_MARK[k]}</span> {heat[k]}
                </button>
              ))}
            </p>
          )}
          {performers.length > 0 && (
            <footer className="ov-day-foot">
              <button
                type="button"
                className="ov-day-more"
                onClick={() => onRankAll()}
                title={`All ${performers.length}, ${categoriesTitle[0].toLowerCase()}${categoriesTitle.slice(1)}`}
              >
                Rank all {performers.length}
              </button>
            </footer>
          )}
        </>
      )}
    </div>
  );
}

/**
 * **Which half of the matchup the leaders card is about.**
 *
 * `summary` is the days it has had and `projected` is the days it has left, and
 * they are two readings of one question rather than two blocks: *who is winning
 * me this week* and *who is going to*. A manager reads the second against the
 * first — a cold roster with a good week ahead is a different Wednesday from a
 * cold roster with three off-days.
 *
 * **In the URL as `lead=proj`**, the summary writing nothing, by the rule every
 * lens in this app follows: which data a view shows belongs in the link. And it
 * is **put away when the page leaves the screen**, with `rproj`, `proj` and
 * `rankproj` — a projected reading is a press about the page it was made on,
 * and a page opens measured unless a link says otherwise.
 */
export type LeadersReading = 'summary' | 'projected';

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
/**
 * **How long the spotlight's notes may be, and why they are what they are.**
 *
 * The heading is `PLAYER SPOTLIGHT` and a note on one line — `.ov-heading` is a
 * wrapping flex row, so a note too long for what is left drops to a second line
 * and the block below it moves down. Reported off the shipped page on the value
 * rail's per-game reading, which was the longest of the five.
 *
 * Measured in the heading's own type (11px/700), the words are **126px** and the
 * gap is 8, so the note's budget is the line less 134:
 *
 * | window | line | budget |
 * | --- | --- | --- |
 * | 320 | 276 | **142** |
 * | 350 | 306 | 172 |
 * | 375 | 331 | **197** |
 * | 390 | 346 | 212 |
 *
 * And the five notes, before → after, measured on the live league (whose period
 * ends `Sep 6`; a two-digit day is about 7px more):
 *
 * | note | was | is |
 * | --- | --- | --- |
 * | trending, 1 day | `added most in the last day` 153 | `added most, last day` **121** |
 * | trending, 3 days | 170 | `added most, last 3 days` **138** |
 * | trending, 7 days | 169 | **137** |
 * | value, total | `most projected value through Sep 6` 207 | `projected value to Sep 6` **141** |
 * | value, per game | `most projected value per game through Sep 6` 264 | `projected value/game to Sep 6` **176** |
 *
 * Driven at 320 / 350 / 375 / 390 / 430 / 1200 after: **nothing wraps from 375
 * up**, where before both value notes wrapped at 375 and the per-game one still
 * wrapped at 390. Below 375 the per-game note is still over budget and there is
 * no wording for it that is not a telegram: at 320 the budget is 142px, about
 * **23 characters** of this type. That is the width at which every one of these
 * notes wrapped before, and the width at which this page's own tab strip already
 * drops a point of type to fit five words.
 *
 * **`through` → `to`** loses a shade of inclusivity and keeps the fact the note
 * is for — how far ahead the figure looks — and the tab's `title` still spells
 * the whole sentence out. **`per game` → `/game`** is the card's own `Val/G`
 * label read out loud. **`most` goes** because the rail is ordered by the
 * figure: a list whose first row is the largest does not need to say so.
 */
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
      note: `added most, last ${spanWords(trending.window)}`,
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
      //
      // **And it is as short as it can be while still saying both**, which is a
      // measurement rather than a preference — see the note on `spanWords`,
      // where the widths and the budgets are written down. `most` goes (the
      // rail's order says it), `through` becomes `to`, and `per game` becomes
      // `/game`, which is what the card's own box label already says (`Val/G`).
      note: per
        ? `projected value/game to ${prettyDate(highValue.through)}`
        : `projected value to ${prettyDate(highValue.through)}`,
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
/**
 * One placeholder for one value — a bar where a figure will be, with a light
 * travelling across it.
 *
 * **The width is a prop because a bar's width is a claim.** A row of identical
 * bars reads as a loading pattern; bars the width of the things they stand in
 * for read as the page, unfinished. So a surname is wider than a rank and a
 * category value is narrower than a batting line, and the shape a reader sees
 * at 250ms is the shape they get at 3s.
 */
/**
 * **Put card `i` in the middle of the scrollport.**
 *
 * Lifted out of `DayCarousel` when the wait grew a row of its own: the two
 * rows have to open on the same card, and two copies of this arithmetic are two
 * chances for the wait to show Yesterday and the page to show Today — which is
 * a horizontal jump under the reader's eye, and is exactly what the first
 * version of the skeleton did (measured at 390: the wait opened on
 * `YESTERDAY`).
 *
 * Written as a `scrollTo` on the row itself rather than as `scrollIntoView`,
 * which is the rule the League page's week list already records: that walks
 * *every* scrollable ancestor including the page, so centering a card would
 * also carry the whole Overview up or down under a reader who asked for
 * neither.
 *
 * The offset is measured off the two rects rather than computed from a card
 * width and a gap. Those are a percentage and a token, and the arithmetic would
 * be a third opinion about a number the browser already has — and the wrong one
 * at the ends, where the row's own padding is what lets the first and last
 * cards reach the middle at all.
 */
/**
 * **Tell the page when this block is on screen, once.**
 *
 * The Overview asks for the slices a reader can actually see and comes back for
 * the rest, and this is what decides "can see". Visibility rather than a swipe
 * or a scroll *event*, because the same three day cards are one-at-a-time on a
 * phone and all three at once on a desk — a rule written in gestures would load
 * nothing on the desk, where nothing is ever swiped to.
 *
 * **It returns a ref callback, and that is the whole of why it works.** Written
 * against a `useRef` object it silently observed nothing: the effect reads
 * `ref.current` once, and two of the three blocks on this page do not exist on
 * the render that runs it — `Matchup leaders` and the opponent's carousel are
 * drawn only once the board has said there is an opponent, which is a round
 * trip later. A callback ref fires when the element actually arrives, and again
 * when it is swapped (a skeleton card becoming a real one is two elements), so
 * attachment cannot drift from the DOM.
 *
 * **It fires once and then stops observing.** A slice is asked for once; a
 * reader scrolling back past a block that already has its data must not make a
 * second request, and `App` would ignore it anyway.
 *
 * `threshold` is the whole of the difference between the callers. A day card
 * wants **half** of itself showing, because the carousel's neighbors peek 22px
 * into the viewport at every width and a peek is not a card the reader is
 * looking at — measured at 390, Today is 100% and each neighbor about 6%. A
 * block below the fold wants **any** of itself plus a `rootMargin` head start,
 * so its data is in flight by the time it is under the eye.
 */
function useOnVisible(
  onSeen: () => void,
  {
    threshold = 0,
    rootMargin = '0px',
    off = false,
  }: { threshold?: number; rootMargin?: string; off?: boolean } = {},
): (el: HTMLElement | null) => void {
  // Both read through refs so the callback identity is stable: it is a `ref`
  // prop, and a new one every render would detach and re-attach the observer on
  // every render of the page.
  const cb = useRef(onSeen);
  cb.current = onSeen;
  const offRef = useRef(off);
  offRef.current = off;
  const io = useRef<IntersectionObserver | null>(null);
  return useCallback(
    (el: HTMLElement | null) => {
      io.current?.disconnect();
      io.current = null;
      // A block that already has its answer is not watched at all — which is
      // also what stops the real card, mounting in the skeleton's place, from
      // asking a second time.
      if (!el || offRef.current) return;
      const obs = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          obs.disconnect();
          cb.current();
        },
        { threshold, rootMargin },
      );
      obs.observe(el);
      io.current = obs;
    },
    [threshold, rootMargin],
  );
}

function centerCard(
  box: HTMLElement | null,
  i: number,
  behavior: ScrollBehavior = 'auto',
): void {
  const card = box?.children[i] as HTMLElement | undefined;
  if (!box || !card) return;
  const delta =
    card.getBoundingClientRect().left -
    box.getBoundingClientRect().left -
    (box.clientWidth - card.clientWidth) / 2;
  box.scrollTo({ left: box.scrollLeft + delta, behavior });
}

function SkBar({ w, h }: { w: string; h?: number }) {
  return <span className="sk-bar" style={{ width: w, ...(h === undefined ? null : { height: h }) }} />;
}

/**
 * A day card with its chrome and none of its figures.
 *
 * **Everything the app already knows is drawn for real.** The lead
 * (`YESTERDAY`/`TODAY`/`TOMORROW`), the date under it and the category
 * abbreviations are not read from anywhere — they are the props this view is
 * given and the league's own category list, both in hand before the first
 * request lands. Only what the read answers with is a bar. That is what makes
 * this a page waiting for its values rather than a grey rectangle: it says
 * *Today, R HR RBI SB OPS, three performers* while it waits.
 *
 * **It is built out of the real card's own classes** — `.ov-day`,
 * `.ov-day-head`, `.lg-cats`, `.ov-perfs`, `.ov-day-foot` — rather than out of
 * declared heights, which is this app's standing rule about reserving a box:
 * the worst case here is a function of the width and of a font the app does not
 * choose, so it is laid out and not stated. Three `.ov-perf` rows are three
 * `.ov-perf` rows whatever they contain.
 */
function SkeletonDay({
  lead,
  date,
  categories,
  projected = false,
  sectionRef,
}: {
  lead: string;
  date: string;
  categories: EspnCategory[];
  /** Drawn as a projection when the card it stands for will be — the dashed
   *  border is the card's own height and border, so a card that arrives dashed
   *  must not have been reserved plain. Tomorrow always is; today is until its
   *  first game starts, which the page knows before the read lands. */
  projected?: boolean;
  /** The observer's handle, when this skeleton *is* the card — a card cannot
   *  ask for its data unless the thing standing in its place is what is being
   *  watched. A ref callback, not a ref object; see `useOnVisible`. */
  sectionRef?: (el: HTMLElement | null) => void;
}) {
  const groups = categoryGroups(categories);
  return (
    <section ref={sectionRef} className={`ov-day sk-day${projected ? ' ov-day-proj' : ''}`}>
      <header className="ov-day-head">
        <span className="ov-day-lead">{lead}</span>
        <span className="ov-day-date">{prettyGameDate(date)}</span>
      </header>
      <div className="lg-cats">
        {groups.map((g) => (
          <div className="ov-cat-block" key={g.side}>
            <div className="lg-cat-row lg-cat-head">
              <span className="lg-cat-side">{g.label}</span>
              {g.categories.map((c) => (
                <span key={c.statId}>{c.label}</span>
              ))}
            </div>
            <div className="lg-cat-row">
              <span className="lg-cat-side" aria-hidden="true" />
              {g.categories.map((c) => (
                <span className="ov-cat-val" key={c.statId}>
                  <SkBar w="72%" />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="ov-perfs-head-row">
        <h4 className="ov-perfs-head">Top Performers</h4>
        <span className="ov-perfs-val-head">VALUE</span>
      </div>
      <ol className="ov-perfs">
        {/* Three, because three is the card's own height — `TOP_N`, which the
            real block reads and this one has no reason to guess differently. */}
        {Array.from({ length: TOP_N }, (_, i) => (
          <li key={i}>
            <span className="ov-perf sk-perf">
              <span className="ov-perf-rank">{i + 1}</span>
              <span className="ov-perf-face sk-bar" />
              <span className="ov-perf-body">
                <span className="ov-perf-name">
                  {/* Three different widths down the column, because three
                      identical ones read as a pattern and a list of names is
                      not one. */}
                  <SkBar w={['62%', '48%', '55%'][i] ?? '55%'} />
                </span>
                <span className="ov-perf-line">
                  <SkBar w={['88%', '74%', '81%'][i] ?? '80%'} />
                </span>
              </span>
              <span className="ov-perf-val">
                <SkBar w="34px" />
              </span>
            </span>
          </li>
        ))}
      </ol>
      {/* The foot is reserved as the row of doors it is, not drawn as one: a
          button that looks pressable and is not is worse than a bar. */}
      <footer className="ov-day-foot">
        <span className="ov-day-more sk-door">
          <SkBar w="60%" />
        </span>
        <span className="ov-day-more sk-door">
          <SkBar w="52%" />
        </span>
      </footer>
    </section>
  );
}

/*
 * **`SkeletonDays` is gone, and its job moved into the row itself.**
 *
 * It drew three placeholder cards while the page's one gate was closed, which
 * was right when the gate was the whole page and wrong the moment the cards
 * became independent: `DayCarousel` renders one card per day either way, and
 * the card is the thing that knows whether *its* slice has answered. A second
 * row that had to be kept in step with the first — its scroll position, its
 * card order, its `OPENS_ON` — is exactly the kind of second copy this file's
 * `centerCard` note was written about, and `DayBlock` returning a `SkeletonDay`
 * needs none of it.
 */

function DayCarousel({
  dates,
  perf,
  loading,
  settled,
  onNeed,
  isProjected,
  categories,
  categoriesTitle,
  onOpenPlayer,
  onSeeDay,
  seeDayTitle,
  onRankDay,
  label,
}: {
  dates: Record<DayKey, string>;
  perf: Record<DayKey, Performer[] | null>;
  loading: Record<DayKey, boolean>;
  /** Which of the three have answered. A card that has not draws the shimmer,
   *  and asks for itself the moment half of it is on screen. */
  settled: Record<DayKey, boolean>;
  /** One card, on screen, wanting its day. The row passes the day key and the
   *  page turns it into a slice name — the row does not know whose carousel it
   *  is, which is the whole reason it is drawn twice. */
  onNeed: (day: DayKey) => void;
  isProjected: Record<DayKey, boolean>;
  categories: EspnCategory[];
  categoriesTitle: string;
  onOpenPlayer: (id: number) => void;
  onSeeDay: ((date: string) => void) | null;
  /** The foot's own `title`, where the row's door is about somebody other than
   *  the reader — see `DayBlock`. */
  seeDayTitle?: string;
  /** Open this card's whole ranked list over the page — see `RankedDayDialog`.
   *  The row raises it rather than each block, there being one dialog at a time
   *  and the row being what knows which card it came from. */
  onRankDay: (day: DayKey) => void;
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
  /**
   * **The `claimsWheel: false` this used to pass is gone with the rule it
   * turned off.** `useOverflowArrows` bound a non-passive `wheel` listener that
   * turned a vertical wheel into sideways travel; this row opted out of it
   * because the band is a third of the screen tall and it *snaps* — a 120px
   * notch inside `scroll-snap-type: x mandatory` is corrected straight back to
   * the card it started on, so the handler took the gesture and could not spend
   * it (measured at 430×900: six wheel-downs moved neither the page nor the
   * row). The tab strips were then reported for the milder form of the same
   * fault and the listener came out altogether, so there is nothing left to
   * decline. See `TabStrip.tsx`, which keeps both halves of that history.
   */
  const { state, measure } = useOverflowArrows(boxRef, wrapRef);
  const over = state.over;
  const [active, setActive] = useState(OPENS_ON);

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
  const center = useCallback(
    (i: number, behavior: ScrollBehavior = 'auto') => centerCard(boxRef.current, i, behavior),
    [],
  );

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
   * **The row opens on Today**, and it opens there *before paint* — a layout
   * effect, so nobody sees Yesterday for a frame and watches it slide.
   *
   * **Keyed on `over`**, which is what makes it fire at the two moments it has
   * to and no other. On mount the hook measures in its own layout effect,
   * `over` goes false → true, and this runs on the flush that follows, still
   * before paint. The other moment is a window crossing 900px from a desk width
   * down to a phone one, where a row that could not scroll now can and would
   * otherwise sit at `scrollLeft: 0` showing Yesterday.
   *
   * It deliberately does **not** re-center on anything else. A reader who has
   * swiped to Tomorrow and is reading it must not be carried back to Today
   * because a projection landed — the same rule as *never over data*, one axis
   * over.
   */
  useLayoutEffect(() => {
    if (!over) return;
    center(OPENS_ON, 'auto');
    setActive(OPENS_ON);
  }, [over, center]);

  return (
    <div className="ov-carousel" ref={wrapRef}>
      <div className="ov-days" ref={boxRef} onScroll={onScroll} aria-label={label}>
        {DAYS.map((d) => (
          <DayBlock
            key={d}
            lead={d.toUpperCase()}
            date={dates[d]}
            projected={isProjected[d]}
            categories={categories}
            categoriesTitle={categoriesTitle}
            performers={perf[d]}
            loading={loading[d]}
            settled={settled[d]}
            onVisible={() => onNeed(d)}
            onOpenPlayer={onOpenPlayer}
            onSeeDay={onSeeDay}
            seeDayTitle={seeDayTitle}
            onRankAll={() => onRankDay(d)}
          />
        ))}
      </div>
      {/* **Drawn only while the row overflows**, which is the measurement
          deciding rather than the breakpoint: three dots over a row already
          showing all three days would be a control for a scroll that cannot
          happen. They are buttons as well as a position — a pointer user has no
          swipe, and the peek at the card edges is the only other thing saying
          there is more of the row than this. */}
      {over && (
        <div className="ov-dots" role="group" aria-label={`Which day — ${label}`}>
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              className={`ov-dot${i === active ? ' is-on' : ''}`}
              aria-current={i === active ? 'true' : undefined}
              aria-label={`${DAY_WORD[d]} — ${prettyGameDate(dates[d])}`}
              title={`${DAY_WORD[d]} — ${prettyGameDate(dates[d])}`}
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
  spanDays,
  spanMine,
  spanOpp,
  projSpan,
  projMine,
  projOpp,
  projLoading,
  leaders,
  onLeaders,
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
  have,
  onNeed,
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
   * **The days this matchup has actually had** — the period clamped to today,
   * in date order, which is what *so far* means and is the same span the
   * roster's `Matchup` preset takes. Null with no league and no window, where
   * the block is absent.
   */
  spanDays: string[] | null;
  /** Both managers' whole matchup, one read apiece — see `MatchupReport`. Null
   *  until it lands and where it failed, and the block is absent rather than
   *  empty in both. */
  spanMine: MatchupReport | null;
  spanOpp: MatchupReport | null;
  /** **The days the matchup has left** — today through the period's last day,
   *  the very span the spotlight's value rail is drawn over. Null past the end
   *  of a period, where the projected reading has nothing to be about and the
   *  switch is not offered. */
  projSpan: { start: string; end: string } | null;
  /** Both managers over those days, one projection apiece. Read **on the first
   *  press of `Projected`** and kept — the League page's own rule for a tab —
   *  so a reader who never presses it pays nothing. */
  projMine: RosterProjection | null;
  projOpp: RosterProjection | null;
  projLoading: boolean;
  /** Which reading the card is on, and the setter behind its switch. Held in
   *  `App` because it is in the URL — see `LeadersReading`. */
  leaders: LeadersReading;
  onLeaders: (r: LeadersReading) => void;
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
  /**
   * **Which slices have answered** — `mine.today`, `theirs.span`. A block whose
   * slice is in here draws itself; one whose slice is not draws bars.
   *
   * It replaces a single page-wide `ready`, and the reason is the reason this
   * page is lazy at all: that flag had to hold the *whole frame* back because
   * it could not say which of the ten reads was outstanding, and holding the
   * frame back is what made the page unable to ask for only what is on screen.
   * A set can say, so the frame is drawn at once and each block waits for its
   * own answer.
   *
   * **It only grows within a reading.** A re-read — the tab crossed and come
   * back to, the clock rolling on resume, the date stepped — leaves it alone,
   * so the last answer stays on screen while the next is in flight. That is
   * rule 1, and it is the job `ovDrawn` used to do for the page as a whole.
   */
  have: ReadonlySet<string>;
  /**
   * **This block is on screen and wants its data.**
   *
   * Called by the visibility observers below, once per slice. Idempotent by
   * construction on the other side — `App` keeps the set — so a block may say
   * it as often as it likes.
   */
  onNeed: (slice: OverviewSliceKey) => void;
}) {
  /**
   * **The league's categories, or the standard 5×5.** A reader with no league
   * still has a roster and still has days; what he has not got is anybody's
   * opinion about which categories matter, so the block says which set it
   * ranked over rather than leaving him to assume it was his.
   */
  const categories = board?.categories?.length ? board.categories : STANDARD_5X5;
  /**
   * **`have` as the two carousels want it** — a slice name per card, read off
   * the set the page keeps. The row does not know whose it is (it is drawn
   * twice, identically), so the side is qualified here where it is known and
   * the row deals in day keys alone.
   */
  /**
   * **The two matchup spans, asked for when the block they feed is reached.**
   *
   * They are the most expensive thing this route computes and the furthest down
   * the page: measured on the live league, the two spans are **3.81 MB of the
   * payload's 4.42** — 86% of it — for a block below the fold on every screen
   * the app is checked at. So they are asked for on approach rather than at
   * boot, and the block shimmers until they land.
   *
   * **Any of it, plus 300px of head start**, where a day card wants half of
   * itself: this is a tall block a reader scrolls *into* rather than swipes to,
   * and waiting for half of it to show would put the request behind the eye
   * instead of in front of it. Both sides at once, because the block is drawn
   * as one two-column card and half of it shimmering beside half of it filled
   * would be a card that looks broken rather than one that is loading.
   */
  const spansHave = have.has('mine.span') && have.has('theirs.span');
  const watchLeaders = useOnVisible(
    () => {
      onNeed('mine.span');
      onNeed('theirs.span');
    },
    { rootMargin: '300px', off: spansHave },
  );

  const mineSettled: Record<DayKey, boolean> = {
    yesterday: have.has('mine.yesterday'),
    today: have.has('mine.today'),
    tomorrow: have.has('mine.tomorrow'),
  };
  const theirsSettled: Record<DayKey, boolean> = {
    yesterday: have.has('theirs.yesterday'),
    today: have.has('theirs.today'),
    tomorrow: have.has('theirs.tomorrow'),
  };
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

  /** **The three days as three lookups**, so the row is a `map` over `DAYS`
   *  rather than three hand-written blocks in an order that has to be kept in
   *  step with the array beside it. It is the same values either way; what it
   *  buys is that `DAYS` is the *only* place the order is stated. */
  const perf: Record<DayKey, Performer[] | null> = {
    yesterday: yesterdayPerf,
    today: todayIsProjected ? todayProj : todayPerf,
    tomorrow: scoreProjected(tomorrow, dates.tomorrow),
  };
  const loading: Record<DayKey, boolean> = {
    yesterday: loadingYesterday,
    // **Two reads behind one card, and one wait.** Until both have answered, a
    // block drawn off either is a block the other may be about to replace —
    // which is the flicker the app's loading discipline exists to prevent, and
    // the only case on this page where a card waits on more than its own read.
    today: loadingToday || (todayPerf !== null && !todayStarted && loadingTodayProjection),
    tomorrow: loadingTomorrow,
  };
  /** Which of the three are estimates: Tomorrow always, Today until it starts. */
  const isProjected: Record<DayKey, boolean> = {
    yesterday: false,
    today: todayIsProjected,
    tomorrow: true,
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

  const oppPerf: Record<DayKey, Performer[] | null> = {
    yesterday: scorePlayed(oppYesterday, dates.yesterday, oppYesterdayLineup),
    today: oppTodayIsProjected ? oppTodayProj : oppTodayPerf,
    tomorrow: scoreProjected(oppTomorrow, dates.tomorrow),
  };
  const oppLoading: Record<DayKey, boolean> = {
    yesterday: oppLoadingYesterday,
    today:
      oppLoadingToday || (oppTodayPerf !== null && !oppTodayStarted && oppLoadingTodayProjection),
    tomorrow: oppLoadingTomorrow,
  };
  const oppProjected: Record<DayKey, boolean> = {
    yesterday: false,
    today: oppTodayIsProjected,
    tomorrow: true,
  };

  /**
   * **Which card's whole ranked list is open**, held as *which day of which
   * row* rather than as the rows themselves — so the dialog follows the day it
   * is about exactly as the card behind it does. `TODAY`'s twenty-second tick
   * rewrites its performers, and a dialog holding the list it was opened with
   * would go on printing the afternoon it opened at while the card underneath
   * moved on. It is also what lets **one** dialog serve both carousels rather
   * than two that would have to agree.
   */
  const [ranked, setRanked] = useState<
    | { kind: 'day'; day: DayKey; opp: boolean }
    /** `heat` is which of the three badges was pressed, absent for the foot's
     *  own `Rank all N`. */
    | { kind: 'span'; opp: boolean; heat?: Heat }
    | null
  >(null);

  /** Every scored value on **both** rosters for whichever list is open — the
   *  population the dialog's chips are ranked against. Built where the two
   *  sides are, since the dialog is handed one of them at a time. */
  const poolOf = (a: Performer[] | null, b: Performer[] | null): number[] =>
    [...(a ?? []), ...(b ?? [])].map((p) => p.value).filter((v): v is number => v !== null);

  /**
   * **Who has won this matchup so far, both sides.**
   *
   * The day cards answer *how was Tuesday*; the card at the top of the page
   * says you are down five categories to four. Neither says **which men** did
   * it, over the week the second one is scoring — and that is the question a
   * manager asks next, about their own roster and about the one they are
   * playing.
   *
   * It is `spanPerformer` over both reports, ranked by `rankDay` and drawn by
   * `PerformerRow` — the same arithmetic, the same filter and the same row as
   * the three day cards above, which is what makes `+5.0` here and `+1.0` up
   * there comparable rather than two figures that happen to share a column
   * heading.
   */
  const spanLineups = (r: MatchupReport | null): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>();
    for (const [d, keys] of Object.entries(r?.lineups ?? {})) m.set(d, new Set(keys));
    return m;
  };
  const leadersOf = (r: MatchupReport | null): Performer[] | null => {
    if (!r || !spanDays) return null;
    const lineups = spanLineups(r);
    return rankDay(
      r.players.map((p) => spanPerformer(p, spanDays, lineups, categories)),
      false,
    );
  };
  const playedLeaders = useMemo(
    () => [leadersOf(spanMine), leadersOf(spanOpp)] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spanMine, spanOpp, spanDays, categories],
  );

  /** …and the same two off the projection, for the days the matchup has left.
   *  `rankDay` with `projected` true, which is the filter that keeps a fraction
   *  of a game on the list where a played day would drop a man who did not
   *  appear. */
  const projLeaders = (proj: RosterProjection | null): Performer[] | null => {
    if (!proj) return null;
    return rankDay(
      proj.players
        .map((p) => projectedSpanPerformer(p, nameOf.get(p.id) ?? `#${p.id}`, categories))
        // **A man with nothing projected is not on the list**, which is the
        // filter `rankDay` deliberately does not apply to a projected block and
        // `scoreProjected` applies by hand for the same reason: a projected
        // *day* is a fraction of one game and a man with no game that day is
        // still on the roster, but over a whole span *no appearances at all* is
        // an honest absence (`ProjectedPlayerLine.chances` of nought — a club
        // with no game left, a starter whose turn does not fall in the span, a
        // man the plan benches throughout). Left in, five of them sat at the
        // foot of the list at `+0.0` and, worse, counted as **cold** — a
        // reading about form made about somebody who is not going to play.
        .filter((p) => anyPlay(p.line)),
      true,
    );
  };
  const projectedLeaders = useMemo(
    () => [projLeaders(projMine), projLeaders(projOpp)] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projMine, projOpp, nameOf, categories],
  );

  /** **The switch is offered only where there is something behind both sides of
   *  it**, which is the app's rule that a control with one live option marks
   *  nothing: past the end of a period there are no days left to project. */
  const canProject = projSpan !== null;
  const showProjected = canProject && leaders === 'projected';
  const [myLeaders, oppLeaders] = showProjected ? projectedLeaders : playedLeaders;
  const leadersLoading = showProjected && projLoading;
  /**
   * **The switch is a lazy read too, and it draws the same bars.**
   *
   * `Projected` has always been fetched on its first press — the days the week
   * has *left*, which nothing else on the page needs — and it drew a turning
   * ball while it came. Now it draws what every other unanswered block on this
   * page draws, which is the point of the shimmer being a *frame*: a reader who
   * has learnt that bars mean "coming" should not have to learn a second thing
   * for one control.
   *
   * Per side, because the two are read together but a block half filled and
   * half spinning was never the alternative — both are null until the one
   * request lands.
   */
  const leadersSettled = showProjected
    ? [myLeaders !== null, oppLeaders !== null]
    : [spansHave, spansHave];
  /** The reader's own team name for the block's left head, off the board the
   *  matchup card is already drawn from. `You` where the board has no row for
   *  him, which is the same fallback his own card's identity takes. */
  const myName = (myTeamId != null ? teams.get(myTeamId)?.name : null) ?? 'You';
  /** The other side of the reader's own matchup, for the badge on his half of
   *  the block and on any dialog about him. Off `mine` rather than threaded
   *  down from App: the matchup is already here and it is the one place that
   *  knows which of its two sides is not the reader's. */
  const oppTeamId =
    mine && myTeamId != null
      ? mine.home.teamId === myTeamId
        ? (mine.away?.teamId ?? null)
        : mine.home.teamId
      : null;


  /**
   * **The matchup card, defined once and drawn in both states of the page.**
   *
   * It is the one block here whose data is not part of what `ready` waits for
   * — `/api/espn/scoreboard` is its own read, and a fast one (549–768ms on the
   * two slow boots measured, against 3.7s and 21s for the days) — so it is the
   * one block the wait can show for real rather than as bars. Bound to a name
   * rather than written twice: two copies of a card carrying a
   * `markMine={false}` argument are two chances for the wait and the page to
   * draw the same matchup differently.
   */
  const matchupBlock =
    connected && mine ? (
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
    ) : null;

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
   *
   * ### And what the wait draws is the page, not a ball
   *
   * Everything above is about the **unit** — one wait for the whole page rather
   * than nine — and none of it has moved. What changed is what that one wait
   * looks like, and the reason is measured: this page's read is **3.5s at p50
   * and 7.1 at p90** in production, and it has been 21. A turning ball is the
   * right thing to show for a second and the wrong thing to show for seven,
   * because all it says is *something is happening* and the reader has nothing
   * to read while it says it.
   *
   * So the wait is **the page with its values missing**. Everything the app
   * already knows is drawn for real — the headings, the span note, the three
   * day leads and their dates, the league's own category abbreviations, the
   * `Top Performers` head — and only the figures the read answers with are
   * bars. A reader at 250ms already knows what page they are on, which three
   * days it covers and which categories it is about; what they are waiting for
   * is the numbers, and the bars are where the numbers go.
   *
   * **It costs no extra reflow, which is what makes it allowed at all.** The
   * skeleton is built out of the real cards' own classes, so its geometry is
   * the page's by construction rather than by declared heights that would be
   * wrong at some width — the app's standing rule about reserving a box. The
   * sequence stays two states and one change.
   *
   * **The matchup card is drawn for real here**, when its own read has
   * answered, and that is an application of the all-at-once rule rather than a
   * hole in it: the card comes off `/api/espn/scoreboard`, which is not one of
   * the reads `ready` waits for and lands well before them. Where it has not
   * yet, it arrives during the wait and pushes the skeleton down — the one
   * reflow this keeps, and it is a block appearing above an unread placeholder
   * rather than under a reader's finger.
   *
   * **`Their days` and `Matchup leaders` are deliberately not drawn.** Whether
   * either exists at all depends on the board — no league, no matchup this
   * period, or a bye — so a skeleton for them would be a claim the page might
   * have to take back, which is worse than growing downward below the fold.
   */
  /**
   * **The frame is drawn at once and each block waits for its own answer.**
   *
   * The page used to hold the *whole* body behind one `ready`, on the argument
   * that three cards of one carousel are not three panes and a page that
   * assembles itself in five states is a page assembling itself. Every word of
   * that is still true, and it is what makes the shimmer a *frame* rather than
   * a spinner: the skeleton is built from the real cards' own classes, so the
   * page has its final geometry from the first paint and nothing reflows when
   * the figures land.
   *
   * **What changed is that the frame no longer waits for the data.** It cannot:
   * the whole point of asking for what is on screen is that something has to be
   * on screen for the observers to see, and a gate that hides the frame hides
   * the very blocks whose visibility decides what to ask for. So the frame is
   * unconditional and `have` decides, block by block, whether a block draws
   * itself or bars.
   *
   * The `WAIT_DELAY` that used to sit in front of the ball is gone with it. It
   * was there because a warm load cleared the gate inside it and a quarter
   * second of spinner before a finished page is a flash — but the frame is not
   * a spinner, it is the page, and there is nothing to flash: the headings, the
   * dates and the category names are the same before the read and after it.
   */
  return (
    <div className="overview-view">
      {/* **The matchup block is absent rather than empty without a league**, the
          app's own rule for a mark that would have nothing behind it: a heading
          reading `Your matchup` over a message saying there isn't one is chrome
          for a feature the reader hasn't got, and the three day blocks below it
          are a whole page on their own. */}
      {matchupBlock}

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
        <span className="ov-heading-note">
          {prettyDate(dates.yesterday)} – {prettyDate(dates.tomorrow)}
        </span>
      </h2>
      <DayCarousel
        dates={dates}
        perf={perf}
        loading={loading}
        settled={mineSettled}
        onNeed={(d) => onNeed(`mine.${d}` as OverviewSliceKey)}
        isProjected={isProjected}
        categories={categories}
        categoriesTitle={categoriesTitle}
        onOpenPlayer={onOpenPlayer}
        onSeeDay={onSeeDay}
        onRankDay={(day) => setRanked({ kind: 'day', day, opp: false })}
        label="Your days — yesterday, today and tomorrow"
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
            dates={dates}
            perf={oppPerf}
            loading={oppLoading}
            settled={theirsSettled}
            onNeed={(d) => onNeed(`theirs.${d}` as OverviewSliceKey)}
            isProjected={oppProjected}
            categories={categories}
            categoriesTitle={categoriesTitle}
            onOpenPlayer={onOpenPlayer}
            onSeeDay={onSeeOppDay}
            onRankDay={(day) => setRanked({ kind: 'day', day, opp: true })}
            /* `possessive`, not `+ "’s"`: half this league's names end in an
               `s` and `Baldy's Bozos’s` reads as a typo — the same rule and the
               same function a slot chip's title on his page already takes. */
            seeDayTitle={`Read ${possessive(opponentName)} roster over this day`}
            label={`${opponentName} — yesterday, today and tomorrow`}
          />
        </>
      )}
      {/* **Who has actually won the week, both sides, in one card.**

          It is the question the two blocks above it leave open. The card at the
          top of the page says you are down five categories to four; the day
          cards say how Tuesday went. Neither says **which men** did it over the
          days the scoreboard is scoring — which is the thing a manager asks
          next, about their own roster and about the one they are playing.

          **One card with two halves rather than two cards**, because the
          reading *is* the comparison: two lists a gutter apart are read across,
          and two cards a heading apart are read one after the other.

          **Absent rather than empty on every way it can have no subject** — no
          league, no matchup, a bye, no matchup window, or a read that failed —
          which is the same three-way absence `Their days` above it already
          takes, plus the two reads' own. A heading over a message saying there
          is nothing to compare is chrome for a week that has not got one. */}
      {opponentName !== null && spanDays !== null && (
        <>
          <h2 className="ov-heading">
            Matchup leaders
            {/* **The note is the days it is over**, which is the one fact the
                rows cannot carry and the one that separates this block from the
                three above it: `+5.0` means nothing until you know it is five
                days — and it is a *different* set of days on each reading,
                which is the other half of why the note is here rather than in
                the card. Same shape as `Your days`' own span note. */}
            <span className="ov-heading-note">
              {showProjected && projSpan
                ? `through ${prettyDate(projSpan.end)}`
                : `${prettyDate(spanDays[0])} – ${prettyDate(spanDays[spanDays.length - 1])}`}
            </span>
            {/* **The switch sits in the heading**, where the spotlight's sits
                under its own: this block is one card and a control inside it
                would be a fourth thing in a box that is already two columns of
                three rows. `.view-switch` outright — the app's own switch, and
                the same one the spotlight's two readings take. */}
            {canProject && (
              <span className="ov-heading-switch">
                <span className="view-switch" role="tablist" aria-label="Matchup leaders reading">
                  {(
                    [
                      ['summary', 'Summary', 'Who has won this matchup so far — the days it has had'],
                      ['projected', 'Projected', 'Who is projected to win it — the days it has left'],
                    ] as const
                  ).map(([key, label, title]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={key === leaders}
                      className={`view-tab${key === leaders ? ' active' : ''}`}
                      onClick={() => onLeaders(key)}
                      title={title}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </span>
            )}
          </h2>
          {/* **An estimate never wears the same clothes as a measurement** —
              the dashed border `.ov-day-proj` already takes, at the size of the
              whole card because every figure in it is one. */}
          <section
            ref={watchLeaders}
            className={showProjected ? 'ov-leaders is-proj' : 'ov-leaders'}
          >
            <LeaderSide
              settled={leadersSettled[0]}
              name={myName}
              team={myTeamId != null ? teams.get(myTeamId) : undefined}
              performers={myLeaders}
              loading={leadersLoading}
              projected={showProjected}
              categories={categories}
              categoriesTitle={categoriesTitle}
              onOpenPlayer={onOpenPlayer}
              onRankAll={(heat) => setRanked({ kind: 'span', opp: false, heat })}
            />
            <LeaderSide
              settled={leadersSettled[1]}
              name={opponentName}
              team={oppTeamId != null ? teams.get(oppTeamId) : undefined}
              performers={oppLeaders}
              loading={leadersLoading}
              projected={showProjected}
              categories={categories}
              categoriesTitle={categoriesTitle}
              onOpenPlayer={onOpenPlayer}
              onRankAll={(heat) => setRanked({ kind: 'span', opp: true, heat })}
            />
          </section>
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
          `RankedDayDialog`. Raised here rather than inside a carousel so the two
          rows share one box: there is one of these open at a time, and which
          row it came from is two characters of state rather than a second
          dialog that would have to agree with the first. */}
      {ranked &&
        (ranked.kind === 'day' ? (
          <RankedDialog
            subject={`${DAY_WORD[ranked.day]}, ${prettyGameDate(dates[ranked.day])}`}
            span={false}
            projected={(ranked.opp ? oppProjected : isProjected)[ranked.day]}
            performers={(ranked.opp ? oppPerf : perf)[ranked.day]}
            /* **Both sides of the carousel wear their own head**, where your
               own day card's dialog used to pass `null` and open on a bare
               `Today, Aug 28`.

               The rule that argued for the bare form is real and is stated on
               `who` — a mark that would be on every row marks nothing — but it
               is about a mark *inside* a list, and this is the head of a box.
               Two of these are opened one after the other on this page (your
               card, then the opponent's), and the reading a manager is making
               is *which of us*; a title that says whose list it is only on one
               of the two makes the reader supply the other from memory. The
               `Matchup leaders` block above already names both sides for
               exactly that reason, so this is the day cards catching up to it
               rather than a new idea.

               `myTeamId != null` is the gate rather than `who` itself: with no
               league connected there is no team, no name worth printing (the
               fallback is the literal word `You`) and no opponent card to be
               told apart from — so that reader keeps the subject alone on one
               line, which is the whole of what the old branch was right
               about. */
            who={ranked.opp ? opponentName : myTeamId != null ? myName : null}
            whoTeam={teams.get((ranked.opp ? oppTeamId : myTeamId) ?? -1)}
            pool={poolOf(
              rankDay(perf[ranked.day], isProjected[ranked.day]),
              rankDay(oppPerf[ranked.day], oppProjected[ranked.day]),
            )}
            categories={categories}
            categoriesTitle={categoriesTitle}
            onOpenPlayer={onOpenPlayer}
            onClose={() => setRanked(null)}
          />
        ) : (
          /* **The same box over a week instead of a day**, which is the whole
              of why `RankedDialog` takes a subject rather than a date: one
              dialog, two kinds of list, and the rows are identical because the
              `Performer` is. `who` names the opponent and is null on your own
              side, the rule that a mark which would be on every row marks
              nothing. */
          <RankedDialog
            subject={
              showProjected && projSpan
                ? `${prettyGameDate(projSpan.start)} – ${prettyGameDate(projSpan.end)}`
                : spanDays
                  ? `${prettyGameDate(spanDays[0])} – ${prettyGameDate(spanDays[spanDays.length - 1])}`
                  : 'This matchup'
            }
            span
            heat={ranked.heat}
            projected={showProjected}
            performers={ranked.opp ? oppLeaders : myLeaders}
            who={ranked.opp ? opponentName : myName}
            whoTeam={teams.get((ranked.opp ? oppTeamId : myTeamId) ?? -1)}
            pool={poolOf(myLeaders, oppLeaders)}
            categories={categories}
            categoriesTitle={categoriesTitle}
            onOpenPlayer={onOpenPlayer}
            onClose={() => setRanked(null)}
          />
        ))}
    </div>
  );
}

export type { Performer };
