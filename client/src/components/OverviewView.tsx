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
import type {
  EspnCategory,
  EspnScoreboard,
  EspnStandingsTeam,
  PlayerReport,
  RosterProjection,
  SeasonPlayer,
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
  prettyDate,
  prettyGameDate,
  surname,
} from '../lib';
import { LoadingBlock } from './Loading';
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

/** A pitcher's day in one phrase — `6.0 IP, 6 K, 0 ER, W`. The batter's
 *  equivalent is `lib.ts::lineSummary`, which every other surface in the app
 *  already prints; there was no pitcher's twin of it because no other surface
 *  prints a pitcher's *day* in a sentence, and this is deliberately terser than
 *  `rangePitchingSummary` — over one outing an ERA is the earned runs and a
 *  WHIP is the baserunners, so printing both would be printing the same two
 *  numbers twice. */
function pitchSummary(line: DayLine): string {
  const p = line.pitching;
  if (!p) return '—';
  const parts = [`${formatIp(p.outs)} IP`, `${p.strikeouts} K`, `${p.earnedRuns} ER`];
  if (p.hits + p.walks > 0) parts.push(`${p.hits + p.walks} BR`);
  if (p.wins) parts.push('W');
  if (p.saves) parts.push('SV');
  if (p.holds) parts.push('HD');
  return parts.join(', ');
}

/** A projected line in the same phrase, with the fractions kept. `0.7 H` reads
 *  as an expectation where `1 H` would read as a hit somebody got; an estimate
 *  never wears the same clothes as a measurement, and here that is the decimal
 *  as much as the dashed border around the block. */
function projSummary(kind: 'batter' | 'pitcher', line: DayLine): string {
  if (kind === 'pitcher') {
    const p = line.pitching;
    if (!p) return '—';
    const parts = [`${(p.outs / 3).toFixed(1)} IP`, `${p.strikeouts.toFixed(1)} K`];
    if (p.earnedRuns > 0) parts.push(`${p.earnedRuns.toFixed(1)} ER`);
    if (p.wins >= 0.1) parts.push(`${p.wins.toFixed(1)} W`);
    if (p.saves + p.holds >= 0.1) parts.push(`${(p.saves + p.holds).toFixed(1)} SVHD`);
    return parts.join(', ');
  }
  const b = line.batting;
  if (!b) return '—';
  // **Four terms at most, and the fourth is whichever is worth most.** Six
  // fractions wrapped to two lines in a 365px block and read as a table that
  // had lost its columns; a projected day's *shape* is carried by the plate
  // appearances, the hits and the one thing he is likelier than usual to do.
  const parts = [`${b.pa.toFixed(1)} PA`, `${b.hits.toFixed(1)} H`];
  const extras: [number, string][] = [
    [b.hr, 'HR'],
    [b.rbi, 'RBI'],
    [b.runs, 'R'],
    [b.sb, 'SB'],
  ];
  extras
    .filter(([v]) => v >= 0.05)
    .sort((x, y) => y[0] - x[0])
    .slice(0, 2)
    .forEach(([v, label]) => parts.push(`${v.toFixed(1)} ${label}`));
  return parts.join(', ');
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
  onOpenPlayer,
}: {
  rank: number;
  p: Performer;
  projected: boolean;
  onOpenPlayer: (id: number) => void;
}) {
  const summary = projected
    ? projSummary(p.kind, p.line)
    : p.kind === 'pitcher'
      ? pitchSummary(p.line)
      : lineSummary(p.line.batting ?? NO_BATTING);
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
  onOpenPlayer,
  onSeeDay,
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
  /** **Null draws no foot at all**, which is the opponent's carousel: the door
   *  this opens is the Roster view, and that is *yours*. A press promising
   *  somebody else's Tuesday and delivering your own would be worse than no
   *  press — his roster is read on the matchup page, one press away through the
   *  card at the top of this one. */
  onSeeDay: ((date: string) => void) | null;
}) {
  const total = useMemo(
    () => addLines((performers ?? []).map((p) => p.line)),
    [performers],
  );
  /**
   * **The list is of men who *played*, which is a filter the totals do not
   * take.** A man in the lineup whose club was idle contributes 0 to every
   * counting category and nothing at all to the rates, so counting him in the
   * day's figures is right and costs nothing — and ranking him is not: a score
   * of exactly `+0.0` for having done nothing sorts **above** a man who went
   * 0-for-4, whose OPS contribution is genuinely negative.
   *
   * Found at 4am ET the morning after this shipped, which is the hour that
   * makes it visible: the baseball day had rolled to a card with no games
   * played on it, and `TODAY` listed three men at `0-0` and `+0.0` under a
   * category line of noughts — where the block has a sentence for exactly that
   * state and was one empty list away from saying it.
   *
   * A projected block takes no such filter: every line in it is a fraction of a
   * game nobody has played, which is the whole point of it.
   */
  const top = useMemo(
    () =>
      (performers ?? [])
        .filter((p) => p.value !== null && (projected || anyPlay(p.line)))
        .sort((a, b) => b.value! - a.value!)
        .slice(0, TOP_N),
    [performers, projected],
  );

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
          <LoadingBlock>Reading your {lead.toLowerCase()}</LoadingBlock>
        ) : (
          <p className="ov-day-empty">Nothing to report on — no roster is being read.</p>
        )
      ) : (
        <>
          <CategoryLine categories={categories} line={total} projected={projected} />
          {top.length === 0 ? (
            <p className="ov-day-empty">
              {projected
                ? `Nobody in ${lead.toLowerCase()}’s lineup has a game to play.`
                : anyPlay(total)
                  ? 'Nobody in the lineup has done anything worth ranking yet.'
                  : 'No games played yet.'}
            </p>
          ) : (
            <ol className="ov-perfs">
              {top.map((p, i) => (
                <li key={p.key}>
                  <PerformerRow rank={i + 1} p={p} projected={projected} onOpenPlayer={onOpenPlayer} />
                </li>
              ))}
            </ol>
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
          {onSeeDay && (
            <footer className="ov-day-foot">
              <button
                type="button"
                className="ov-day-more"
                onClick={() => onSeeDay(date)}
                title={categoriesTitle}
              >
                See the day
              </button>
            </footer>
          )}
        </>
      )}
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
function DayCarousel({
  dates,
  perf,
  loading,
  isProjected,
  categories,
  categoriesTitle,
  onOpenPlayer,
  onSeeDay,
  label,
}: {
  dates: Record<DayKey, string>;
  perf: Record<DayKey, Performer[] | null>;
  loading: Record<DayKey, boolean>;
  isProjected: Record<DayKey, boolean>;
  categories: EspnCategory[];
  categoriesTitle: string;
  onOpenPlayer: (id: number) => void;
  onSeeDay: ((date: string) => void) | null;
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
            onOpenPlayer={onOpenPlayer}
            onSeeDay={onSeeDay}
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
  dates,
  onOpenPlayer,
  onSeeDay,
  connected,
}: {
  board: EspnScoreboard | null;
  onOpenMatchup: (id: number) => void;
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
  dates: { today: string; yesterday: string; tomorrow: string };
  onOpenPlayer: (id: number) => void;
  onSeeDay: (date: string) => void;
  connected: boolean;
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
            mineTag={false}
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
        <span className="ov-heading-note">
          {prettyDate(dates.yesterday)} – {prettyDate(dates.tomorrow)}
        </span>
      </h2>
      <DayCarousel
        dates={dates}
        perf={perf}
        loading={loading}
        isProjected={isProjected}
        categories={categories}
        categoriesTitle={categoriesTitle}
        onOpenPlayer={onOpenPlayer}
        onSeeDay={onSeeDay}
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

          **`See the day →` is not drawn on these cards**, and that is the one
          thing that is not simply the same component: the door it opens is the
          Roster view, which is *yours*. A press that promised somebody else's
          Tuesday and delivered your own would be worse than no press at all;
          the matchup page is where a leaguemate's roster is read, and it is one
          press away through the card at the top. */}
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
            isProjected={oppProjected}
            categories={categories}
            categoriesTitle={categoriesTitle}
            onOpenPlayer={onOpenPlayer}
            onSeeDay={null}
            label={`${opponentName} — yesterday, today and tomorrow`}
          />
        </>
      )}
    </div>
  );
}

export type { Performer };
