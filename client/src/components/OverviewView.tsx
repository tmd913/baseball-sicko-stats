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
import { useMemo } from 'react';
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
  prettyGameDate,
  surname,
} from '../lib';
import { LoadingBlock } from './Loading';
import { MatchupCard, categoryGroups, fmtValue } from './LeagueView';
import { ProjectedGlyph } from './Projection';

/** How many men a day block names. Three, and the number is the block's own
 *  height rather than a taste: a day card carries a head, two category rows and
 *  a list, and three rows is what fits beside the other two blocks at 1200
 *  without either the card or the page scrolling. A fourth is one press away —
 *  the whole roster's day is the Roster view with the date set to that day,
 *  which is where the `See the day →` foot goes. */
const TOP_N = 3;

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
  categoriesName,
  categoriesTitle,
  performers,
  who,
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
  categoriesName: string;
  categoriesTitle: string;
  performers: Performer[] | null;
  /** **Whose day this is a day of**, already in words — `Lineup · 20 of 29` on
   *  a fantasy team, `Watchlist · 16` without one. Computed by the view rather
   *  than here because each of the three blocks knows it differently: the two
   *  played days read ESPN's own lineup off their report, and the projected one
   *  reads the *plan* off the projection, there being no lineup for tomorrow to
   *  have. A block that worked it out itself would need all three. */
  who: string;
  loading: boolean;
  onOpenPlayer: (id: number) => void;
  onSeeDay: (date: string) => void;
}) {
  const total = useMemo(
    () => addLines((performers ?? []).map((p) => p.line)),
    [performers],
  );
  const top = useMemo(
    () =>
      (performers ?? [])
        .filter((p) => p.value !== null)
        .sort((a, b) => b.value! - a.value!)
        .slice(0, TOP_N),
    [performers],
  );

  return (
    <section className={projected ? 'ov-day ov-day-proj' : 'ov-day'}>
      <header className="ov-day-head">
        <span className="ov-day-lead">
          {lead}
          {projected ? (
            <>
              {' · '}
              <span className="ov-day-proj-tag">
                <ProjectedGlyph size={12} /> PROJECTED
              </span>
            </>
          ) : null}
        </span>
        <span className="ov-day-date">{prettyGameDate(date)}</span>
        <span className="ov-day-who">{who}</span>
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
                ? 'Nobody in tomorrow’s lineup has a game to play.'
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
          <footer className="ov-day-foot">
            <span className="ov-day-scale" title={categoriesTitle}>
              {categoriesName}
            </span>
            <button type="button" className="ov-day-more" onClick={() => onSeeDay(date)}>
              See the day →
            </button>
          </footer>
        </>
      )}
    </section>
  );
}

/* ---- The view ------------------------------------------------------------ */

export default function OverviewView({
  board,
  onOpenMatchup,
  today,
  yesterday,
  tomorrow,
  todayLineup,
  yesterdayLineup,
  loadingToday,
  loadingYesterday,
  loadingTomorrow,
  usingFantasy,
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
  /** Who was in the lineup on each played day, as player keys. Null in
   *  saved-roster mode and on a day the per-day read could not answer for, in
   *  which case the block counts everybody and says `Watchlist` rather than
   *  claiming a lineup it does not have. */
  todayLineup: Set<string> | null;
  yesterdayLineup: Set<string> | null;
  loadingToday: boolean;
  loadingYesterday: boolean;
  loadingTomorrow: boolean;
  usingFantasy: boolean;
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
  const categoriesName = own > 0 ? `${own} league categories` : 'standard 5×5';
  const categoriesTitle = `Ranked over ${categories.map((c) => c.label).join(' · ')}`;

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

  /** The projected day. **`lineup` is the projection's own plan**, not a read of
   *  ESPN — tomorrow has no lineup yet, and what the engine can say is what it
   *  would start him for (`ProjectedPlayerLine.lineup`). A man it would bench
   *  every day of the span has an empty `days` and is not in the block, which
   *  is the same cut the played days make and the reason the three read alike. */
  const projected = useMemo((): Performer[] | null => {
    if (!tomorrow) return null;
    const out: Performer[] = [];
    for (const p of tomorrow.players) {
      const seat = p.lineup;
      const day = seat?.days.find((d) => d.day === dates.tomorrow);
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
  }, [tomorrow, dates.tomorrow, nameOf, categories]);

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

  /**
   * **How many men this block is a block of.** `Lineup · 20 of 29` where there
   * is a lineup to have been in, `Watchlist · 16` where there is not — and the
   * distinction is not cosmetic, a lineup total being the one that agrees with
   * the scoreboard above it and a roster total being the one that does not.
   *
   * A fantasy team whose per-day lineup read failed falls back to the second
   * form, which is the honest direction: it counted everybody, so it says so.
   */
  const whoPlayed = (reports: PlayerReport[] | null, lineup: Set<string> | null) => {
    const roster = reports?.length ?? 0;
    if (!usingFantasy || !lineup) return `Watchlist · ${roster}`;
    // The lineup ESPN published can name men this roster read does not carry —
    // somebody dropped since — so the count is the intersection rather than the
    // set's own size, which is what the block actually drew.
    const inBoth = (reports ?? []).filter((r) => lineup.has(playerKey(r))).length;
    return `Lineup · ${inBoth} of ${roster}`;
  };

  /** The projected block's, off the **plan** rather than off a lineup: tomorrow
   *  has none, and what the engine can say is which seat it would start him in
   *  (`ProjectedPlayerLine.lineup.days`). A man it would bench every day of the
   *  span has an empty `days` and is not in the count, which is the same cut the
   *  block itself makes. */
  const whoProjected = useMemo(() => {
    if (!tomorrow) return '';
    const roster = tomorrow.players.length;
    if (!usingFantasy || !tomorrow.players.some((p) => p.lineup)) {
      return `Watchlist · ${roster}`;
    }
    const started = tomorrow.players.filter((p) =>
      p.lineup?.days.some((d) => d.day === dates.tomorrow),
    ).length;
    return `Lineup · ${started} of ${roster}`;
  }, [tomorrow, usingFantasy, dates.tomorrow]);

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

      <div className="ov-days">
        <DayBlock
          lead="TODAY"
          date={dates.today}
          categories={categories}
          categoriesName={categoriesName}
          categoriesTitle={categoriesTitle}
          performers={todayPerf}
          who={whoPlayed(today, todayLineup)}
          loading={loadingToday}
          onOpenPlayer={onOpenPlayer}
          onSeeDay={onSeeDay}
        />
        <DayBlock
          lead="YESTERDAY"
          date={dates.yesterday}
          categories={categories}
          categoriesName={categoriesName}
          categoriesTitle={categoriesTitle}
          performers={yesterdayPerf}
          who={whoPlayed(yesterday, yesterdayLineup)}
          loading={loadingYesterday}
          onOpenPlayer={onOpenPlayer}
          onSeeDay={onSeeDay}
        />
        <DayBlock
          lead="TOMORROW"
          date={dates.tomorrow}
          projected
          categories={categories}
          categoriesName={categoriesName}
          categoriesTitle={categoriesTitle}
          performers={projected}
          who={whoProjected}
          loading={loadingTomorrow}
          onOpenPlayer={onOpenPlayer}
          onSeeDay={onSeeDay}
        />
      </div>
    </div>
  );
}

export type { Performer };
