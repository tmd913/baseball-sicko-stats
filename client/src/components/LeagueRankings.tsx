/**
 * The League page's **Rankings** tab — where every team stands in each of the
 * league's own scoring categories, over one of five spans.
 *
 * **This is the season table the page opened with, read the other way round.**
 * That table was the raw values, and a value on its own is only half of what a
 * manager wants from it: 232 home runs is a lot or a little depending on the
 * eleven numbers beside it, and the reader was doing that comparison by eye
 * down a column of twelve. So each cell carries the **rank** under the figure —
 * and carries the figure, because a rank with no number behind it cannot be
 * acted on. `1st` is what you are looking for and `12th` is what you are
 * looking for; the value is what you do about it.
 *
 * **Which spans it offers is the league's business, not this file's.** The
 * server answers with the spans it can serve honestly (`spans`) and the bar's
 * own list is drawn from that — so a season whose All-Star break ESPN's
 * calendar does not show has no halves at all, and April has no second half,
 * rather than either being drawn empty. See `espn.ts`, **The Rankings tab**,
 * for what each span is made of and what was measured to establish that it
 * could be. (It was a *strip* in the app's tools row as well until the bar's
 * list grew a `Spans` group holding the same five; one door, one way in.)
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  EspnCategory,
  EspnCategorySide,
  EspnPeriodSpan,
  EspnRankRow,
  EspnRankSpan,
  EspnRankSpanInfo,
  EspnRankings,
} from '../types';
import { useFullPage } from '../hooks';
import { wideRange } from '../lib';
import { ExpandButton } from './ExpandButton';
import { InfoKey } from './InfoKey';
import { LoadingBlock } from './Loading';
import {
  PeriodPicker,
  TeamLogo,
  categoryGroups,
  fmtValue,
  periodDays,
  prettyDate,
  record,
  stateWord,
} from './LeagueView';
import { DateBar } from './DateControls';
import { rankFill } from './columnRanks';

/**
 * What the overall column is called in a header of two- and three-letter
 * abbreviations. `BAT` and `PIT` rather than `Batting` and `Pitching`: this row
 * reads `R · HR · RBI · SB · OPS`, and a word among them would be the one
 * column shouting. `other` is the bucket a stat id `STAT_META` has never been
 * read against falls into, and it says so rather than guessing a side.
 */
const SIDE_ABBR: Record<EspnCategorySide, string> = {
  batting: 'BAT',
  pitching: 'PIT',
  other: 'OTH',
};

/** `1st`, `2nd`, `3rd`, `12th` — the ordinal a league table is read in. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * The badge's own fill, from its rank.
 *
 * **A diverging scale over the teams in one category — red at the top, blue at
 * the bottom, gray in the middle.** It is a departure from a rule this codebase
 * states at length, so it is worth stating why here rather than leaving a
 * reader to find the contradiction: the research board's stat columns are
 * deliberately **monochrome** and its percentile badges deliberately `--faint`,
 * on the grounds that "color is reserved for *state*" (see
 * `client-research.md`). That rule is right for a six-hundred-row leaderboard
 * whose job is to be *scanned* for names, where a heat map would be a second
 * color system beside the live inning, the postponement and the trend. This
 * table is the other thing: **twelve rows read for standing**, with no live
 * state on it at all, and where the board says "here is a number, judge it" a
 * league table says "here is where you are". The color *is* the reading, and
 * on a table this small it is the difference between finding your weak category
 * at a glance and reading twelve ordinals.
 *
 * **It is on the badge, where it used to wash the whole cell.** A cell wash had
 * to be a translucent layer over whatever ground the row resolved, so it could
 * only ever be faint (22% at its strongest) and it painted a color across the
 * *value* as well as the rank — a figure tinted by its own standing, which is
 * the one thing a raw number on this page is there to avoid. On the chip the
 * scale can be strong enough to read at a glance and it stops where the claim
 * stops: `1st` is red, the figure beside it is just the figure.
 *
 * **It colors the rank, never the value**, which is what makes it right for a
 * `lowerBetter` category with no special case at all: the server has already
 * computed the rank with the direction baked in (`rankBy`, `1` is best whichever
 * way the category runs), so a 3.29 ERA and 232 home runs are both `1st` and
 * both take the same red. **Ties share a rank and so share a color** by the
 * same construction.
 *
 * **The fill carries the scale and the text does not.** `--text` on these
 * grounds measures 5.1–5.7:1 at the ends and 12.8:1 in the middle, where
 * coloring the *text* instead — the obvious first move, and the one the old
 * badge made against the cell wash — puts a mid-luminance red on a
 * mid-luminance ground at 3.1:1, under the 4.5 an 11px label owes a reader.
 *
 * **`n` is the teams *ranked in that category*, not the twelve rows**, matching
 * the badge's own denominator: a team with no figure is out of the ranking
 * rather than at the bottom of it, so it gets no badge either.
 */
// The scale itself is `columnRanks.tsx::rankFill`, shared with the research
// board's team reading — two tables ranking clubs 1-to-N under a value are one
// object, and two copies of a diverging scale is how they come to disagree
// about what 15th of 30 looks like. What stays here is the argument above for
// why this table colors a rank at all.
const rankBadge = rankFill;

/**
 * What a span actually covers, in one line.
 *
 * **Not exported any more**, and that is the span strip's removal read one file
 * over: App drew this under the pills as each one's `title`, and the pills are
 * gone — the five cuts are the `Spans` group of the bar's own list, where this
 * is each row's detail line. One caller, in this file.
 *
 * It is not decoration. `First half` is a phrase, and which weeks and which
 * days it is made of is the whole of what makes the numbers under it readable —
 * the same argument the scoreboard's own header makes for printing its dates
 * beside `Week 19` rather than the week number alone. `so far` is the other
 * half of it: a span reaching into the week being played is a total to date,
 * and saying `Season` over a figure that stops on Tuesday would be a claim.
 */
function spanDetail(info: EspnRankSpanInfo | undefined): string {
  if (!info) return '';
  const days = info.start && info.end ? wideRange(info.start, info.end) : null;
  const weeks =
    info.periods == null
      ? null
      : info.periods[0] === info.periods[1]
        ? `Week ${info.periods[0]}`
        : `Weeks ${info.periods[0]}–${info.periods[1]}`;
  const parts = [weeks, days].filter(Boolean) as string[];
  if (info.span === 'season' && parts.length === 0) parts.push("ESPN’s own season line");
  if (info.live) parts.push('so far');
  return parts.join(' · ');
}

/* **`projectedDetail` is gone with the caption it wrote.** It made one line of
   the projected reading — `Week 19 · projected to Aug 23 · 5 days still to
   play` — and every word of its argument survives one function down, in
   `rankFace`, where the same sentence is split across a bar's two lines. A
   function with no caller is a function nobody misses; the reasoning it carried
   is the paragraph on `rankFace` below. */

/**
 * **The bar's two lines, from whichever cut is in force.**
 *
 * This is `spanDetail` split in two rather than a second wording of it: the
 * caption said `Week 19 · Aug 10 – Aug 16 · so far` on one line, and a date bar
 * states the *kind* of days above and the days themselves below — which is the
 * shape every other statement of a span in this app takes, and the reason this
 * row stopped being a caption. So the weeks go up (`Current matchup · Week 19`,
 * `First half · Weeks 1–9`) and the days come down (`Aug 10 – Aug 16 · so far`),
 * and nothing is lost in the move.
 *
 * **`so far` is not decoration.** A span reaching into the week being played is
 * a total to date, and `Season` over a figure that stops on Tuesday would be a
 * claim. It rides on the days, being a fact about them.
 *
 * **Projected replaces both halves**, because both were true of ESPN's figures
 * and neither is true of these: the lens reaches the end of the period, so the
 * lead carries the state word the app spends its accent on and the days say
 * what is being projected to and how much of it is still a guess. That last
 * figure is the one a reader needs most and nothing else on the page carries
 * it — a table projected over five days is a different thing from one projected
 * over one. It comes off the response (`projectedDaysLeft`) rather than being
 * counted here, so the bar, the key and the table cannot come to disagree about
 * how far ahead they are looking.
 */
export function rankFace(
  info: EspnRankSpanInfo | undefined,
  rankings: EspnRankings,
): { lead: ReactNode; range: string } {
  const weeks =
    info?.periods == null
      ? null
      : info.periods[0] === info.periods[1]
        ? `Week ${info.periods[0]}`
        : `Weeks ${info.periods[0]}–${info.periods[1]}`;
  /* `Week 12` on its own rather than `Week 12 · Week 12`: a picked week's label
     *is* its week number, so the two halves would be the same words twice. */
  const name = info ? (weeks && weeks !== info.label ? `${info.label} · ${weeks}` : info.label) : '';
  if (rankings.projected) {
    const to = rankings.projectedEnd ? `to ${prettyDate(rankings.projectedEnd)}` : 'to the end';
    const d = rankings.projectedDaysLeft;
    const left = d > 0 ? `${d} ${d === 1 ? 'day' : 'days'} still to play` : null;
    return {
      lead: (
        <>
          {weeks ?? name}
          {stateWord('projected')}
        </>
      ),
      range: [to, left].filter(Boolean).join(' · '),
    };
  }
  const days = info?.start && info?.end ? wideRange(info.start, info.end) : null;
  /* ESPN's own season line has no dates of its own — it is a running total
     rather than a span — so the lower line says what it is instead of going
     blank, both lines being always filled being what keeps this bar one height. */
  const base = days ?? (info?.span === 'season' ? "ESPN’s own season line" : '—');
  return { lead: name, range: info?.live ? `${base} · so far` : base };
}

type SortKey =
  | { kind: 'team' }
  | { kind: 'cat'; statId: number }
  | { kind: 'side'; side: EspnCategorySide }
  | { kind: 'overall' };

function sameKey(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'cat' && b.kind === 'cat') return a.statId === b.statId;
  if (a.kind === 'side' && b.kind === 'side') return a.side === b.side;
  return true;
}

/**
 * The table.
 *
 * The sort is the season table's own, moved across with it and unchanged in
 * substance — `ascFirst` per category so ERA and WHIP open on their good end,
 * nulls to the bottom in both directions — with one thing added: **sorting is
 * on the rank rather than the value**, which is the same order for every
 * category and is the order the tab is about. It comes to the same thing where
 * every team has a figure, and where one doesn't it keeps that team out of the
 * order rather than filing him at one end of it.
 */
function RankTable({
  rankings,
  categories,
  matchupTeams,
  onOpenTeamMatchup,
  corner,
  paneChrome,
}: {
  rankings: EspnRankings;
  categories: EspnCategory[];
  /** Which teams have a matchup this period and which one. Null until the
   *  board lands — see `openFor` below, which is the whole of the gate. */
  matchupTeams: Map<number, number> | null;
  onOpenTeamMatchup: (teamId: number, matchupId: number) => void;
  /** The full-page button, which goes in the badge column's header cell — the
   *  one cell of this table pinned on both axes, so the way back out is on
   *  screen wherever the reader has scrolled to. The three wide tables put it
   *  in exactly that cell for exactly that reason. */
  corner?: ReactNode;
  /** The app's tools row and this table's own caption, as the pane's first
   *  children rather than the page's — see `LeagueRankings` below, and
   *  `SummaryTable`'s `paneChrome`, which is the same arrangement for the same
   *  reason. Null while expanded, where the caption is above the pane. */
  paneChrome?: ReactNode;
}) {
  // **`OVR` is drawn only where there is more than one side to combine** — the
  // server declines to compute it otherwise, this reads that decision rather
  // than repeating it, and a league scoring one side sees its own column once.
  const hasOverall = rankings.rows.some((r) => r.overall);
  /**
   * **The table opens on `OVR`, best first.**
   *
   * It opened on the league standing — `{ kind: 'team' }`, ESPN's own seed —
   * which is the order the *Scoreboard* is about and not the one this tab is:
   * a reader crossing to Rankings has come to find out who is actually
   * accumulating the categories, and the seed answers a different question
   * (who has won more head-to-head weeks). Measured on the live league over the
   * season span, the seed order put the OVR column at `1st · 6th · 3rd · 5th`
   * down the first four rows, so the column the tab leads with was the one
   * column not in order.
   *
   * **`asc: true` is best first**, here as everywhere on this table: every
   * column sorts on its *rank*, so 1 is first whichever direction the category
   * itself runs — see `toggle` below.
   *
   * **It falls back to the standing where there is no `OVR` column to sort
   * on.** A league scoring one side of the ball has no overall (see
   * `hasOverall`), and a sort keyed to a column that is not drawn is a table
   * that opens with no active header and, every team's overall being null, the
   * order it happened to arrive in.
   */
  const [sort, setSort] = useState<SortKey>(() =>
    hasOverall ? { kind: 'overall' } : { kind: 'team' },
  );
  const [asc, setAsc] = useState(true);

  const teams = useMemo(
    () => new Map(rankings.teams.map((t) => [t.id, t])),
    [rankings.teams],
  );

  // **Batters over pitchers**, each group in its own reading order — see
  // `categoryGroups`. The table renders the groups' concatenation rather than
  // the league's own array, so a cell, its header and the group head above it
  // cannot come to disagree about which column is which.
  const groups = useMemo(() => categoryGroups(categories), [categories]);

  // How many teams are ranked in each category — the badge's denominator and
  // the wash's, computed once rather than per cell.
  const ranked = useMemo(() => {
    const out = new Map<number, number>();
    for (const c of categories) {
      out.set(c.statId, rankings.rows.filter((r) => typeof r.ranks[c.statId] === 'number').length);
    }
    return out;
  }, [categories, rankings.rows]);

  // The same denominator for the summary columns: how many teams have a total
  // at all, which is what each badge is a rank *of*.
  const rankedSide = useMemo(() => {
    const out = new Map<EspnCategorySide, number>();
    for (const g of groups) {
      out.set(g.side, rankings.rows.filter((r) => r.sides[g.side]).length);
    }
    return out;
  }, [groups, rankings.rows]);
  const rankedOverall = useMemo(
    () => rankings.rows.filter((r) => r.overall).length,
    [rankings.rows],
  );

  const rows = useMemo(() => {
    const out = [...rankings.rows];
    out.sort((a, b) => {
      let d = 0;
      if (sort.kind === 'team') {
        d = ((teams.get(a.teamId)?.seed || 99) - (teams.get(b.teamId)?.seed || 99)) as number;
      } else {
        // Both column kinds sort on their **rank**, which is the one order the
        // whole table shares — an overall column is a rank like any other, and
        // sorting it on the points would be the same order said in a second
        // currency.
        const rankOf = (row: EspnRankRow) =>
          sort.kind === 'cat'
            ? row.ranks[sort.statId]
            : sort.kind === 'side'
              ? row.sides[sort.side]?.rank
              : row.overall?.rank;
        const ar = rankOf(a);
        const br = rankOf(b);
        // Nulls to the bottom in **both** directions, the board's own rule: a
        // team with no figure has not got the worst one.
        const an = typeof ar !== 'number';
        const bn = typeof br !== 'number';
        if (an && bn) d = 0;
        else if (an) return 1;
        else if (bn) return -1;
        else d = ar - br;
      }
      return asc ? d : -d;
    });
    return out;
  }, [rankings.rows, sort, asc, teams]);

  const toggle = (key: SortKey) => {
    if (sameKey(key, sort)) setAsc((v) => !v);
    else {
      setSort(key);
      // Every column opens on **first place**, whichever direction the
      // category itself runs — which is the one thing a rank column buys over
      // a value column: `ascFirst` per category stops being something the
      // reader has to know.
      setAsc(true);
    }
  };

  const head = (key: SortKey, label: string, title: string, cls = '') => {
    const active = sameKey(key, sort);
    return (
      <th
        scope="col"
        className={`${cls} research-sort${active ? ' active' : ''}`}
        aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" onClick={() => toggle(key)} title={title}>
          <span className="research-arrow" aria-hidden="true">
            {active ? (asc ? '▲' : '▼') : ''}
          </span>
          {label}
        </button>
      </th>
    );
  };

  const spanInfo = rankings.spans.find((s) => s.span === rankings.span);
  const spanWords = spanInfo ? spanInfo.label.toLowerCase() : 'this span';

  return (
    <div className="league-scroll">
      {/* The app's tools row and this table's caption, in the pane rather than
          above it — see `LeagueRankings`. First, because everything below them
          is the table and the header row sticks at this pane's own top once
          they have scrolled past it. */}
      {paneChrome}
      <table className="league-table">
        <thead>
          {/* **The sections order the columns and are not drawn.** There was a
              spanning `BATTERS` / `PITCHERS` row over each run and a hairline
              where they met, and both are gone: on a table of ten columns the
              two runs are told apart by the categories themselves (nobody reads
              `ERA` as a batting stat), so the row spent a second sticky header
              — and a second pinning offset for the one under it — on a label
              the data already carries.

              **The grouping itself stays and is load-bearing**, which is why
              `groups` is still what the table renders rather than the league's
              own array: it is the server's `side`/`order` (see `STAT_META`),
              and it is the only thing that keeps the batting run before the
              pitching one. What replaces the visible label is the header's own
              `title`, which names the side per column — and that is not a
              consolation but the important half, since `H` is a hit and a hit
              allowed and `K` a strikeout taken and one thrown, so on a league
              scoring both sides the abbreviation alone is genuinely
              ambiguous. */}
          <tr>
            {/* The pinned column is the badge alone — see `.lg-logo-col`. It
                carries no label and no sort: it is the same cell the two roster
                tables give a headshot, and the sort that belongs to a team's
                identity belongs on its name. */}
            <th scope="col" className="lg-logo-col" aria-label="Team badge">
              {corner}
            </th>
            {head({ kind: 'team' }, 'TEAM', 'The league standing', 'lg-name-col')}
            {/* **The whole row in one column, leading the two halves it is made
                of.** It is what a manager wants first — where he stands, full
                stop — and putting it before `BAT` and `PIT` reads as the
                summary and its two parts rather than as a third peer. It is
                their sum by construction, so the three together are a figure a
                reader can check on the page rather than take on trust. */}
            {hasOverall &&
              head(
                { kind: 'overall' },
                'OVR',
                `Overall — points from all ${categories.length} scoring categories, ${spanWords}`,
                'lg-side-col',
              )}
            {groups.flatMap((g) => [
              /* **The group's own overall, leading it.** A manager reading
                 `2nd · 5th · 1st · 9th · 3rd` down his batting run is doing
                 arithmetic in his head, and the arithmetic has a name: roto
                 points over that side's categories, ranked like any other
                 column. It leads rather than trails because it is what the run
                 under it comes to, and because two summaries at fixed positions
                 — one after the name, one after the batting run — are what a
                 reader can find without counting columns. */
              head(
                { kind: 'side', side: g.side },
                SIDE_ABBR[g.side],
                `${g.label} · overall — points from all ${g.categories.length} ${g.label.toLowerCase()} categories, ${spanWords}`,
                'lg-side-col',
              ),
              ...g.categories.map((c) =>
                head(
                  { kind: 'cat', statId: c.statId },
                  c.label,
                  // The direction is stated because a bare abbreviation cannot
                  // say it and it differs per category.
                  `${g.label} · ${c.name} — ${spanWords}${
                    c.lowerBetter ? ', lower is better' : ''
                  }`,
                ),
              ),
            ])}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = teams.get(r.teamId);
            const name = t?.name ?? `Team ${r.teamId}`;
            const identity = t
              ? `${name} — ${record(t)}${r.teamId === rankings.myTeamId ? ' — your team' : ''}`
              : name;
            /**
             * **A team's identity is a press, and it opens that team's own page
             * of this week's matchup.**
             *
             * `matchupTeams` is null until the board lands and holds no key for
             * a team this period has no row for, and either way the identity
             * draws as it always did — plain text, no pointer, no hover, no tab
             * stop. That is deliberate rather than a fallback: a control that
             * leads nowhere is worse than none, and the board is read on entry
             * to this tab (see `App`), so the presses arrive with the table
             * rather than after a reader could have pressed one.
             */
            const matchupId = matchupTeams?.get(r.teamId);
            const open = matchupId == null ? null : () => onOpenTeamMatchup(r.teamId, matchupId);
            const pressLabel = `${name} — open this week’s matchup on his page`;
            const pressTitle = `${identity} · open this week’s matchup on his page`;
            /**
             * A real `<button>` inside the cell rather than `role="button"` on
             * the cell itself, which is the reverse of the Game Log's rows and
             * of a scoreboard card — and for the reason those two record: *"a
             * `<tr>` cannot hold a button without leaving table layout and the
             * whole row is the target"*. Neither clause holds here. The target
             * is a cell's contents, which a button can be, and putting one
             * there keeps the `<td>` a cell and the `<th scope="row">` a row
             * header for a screen reader. Enter and Space are then the
             * browser's own, which is what the reorder chips already prefer
             * over a keydown handler.
             */
            const press = (cls: string, inner: ReactNode) =>
              open ? (
                <button
                  type="button"
                  className={`lg-team-press ${cls}`}
                  onClick={open}
                  title={pressTitle}
                  aria-label={pressLabel}
                >
                  {inner}
                </button>
              ) : (
                inner
              );
            return (
              <tr key={r.teamId} className={r.teamId === rankings.myTeamId ? 'lg-row-mine' : undefined}>
                {/* Two cells, because only the badge pins. The name scrolls
                    away with the stats, which is the board's own rule for a
                    phone: what has to stay is the least that identifies the
                    row, and 168px of team name is paid for out of the
                    categories beside it.

                    **Both are presses**, which is the app's own answer wherever
                    a row names a person: the Transactions feed makes a headshot
                    and the name beside it two doors to one page, having
                    overturned exactly the "the name is 8px away, so a second
                    target is redundant" argument. Here the two are not 8px
                    apart at all — the badge is *pinned* and the name *scrolls*,
                    so whichever of them is on screen is the door, which is the
                    one thing neither alone could give. */}
                {/* The badge is where the reader's own row is marked, the accent
                    ring having replaced the wash that used to run across all
                    twelve cells — so the title names it too, a ring being a
                    thing you see rather than a thing you can read. */}
                <td className="lg-logo-col" title={open ? undefined : identity}>
                  {press('lg-logo-press', <TeamLogo team={t} />)}
                </td>
                <th scope="row" className="lg-name-col">
                  {press(
                    'lg-name-press',
                    <span className="lg-row-name">
                      <span className="lg-row-title">{name}</span>
                      <span className="lg-row-sub">{t ? record(t) : ''}</span>
                    </span>,
                  )}
                </th>
                {hasOverall && (
                  <td className="lg-num lg-side-col">
                    {r.overall ? r.overall.points : '—'}
                    {r.overall && (
                      <span
                        className="col-rank"
                        style={rankBadge(r.overall.rank, rankedOverall)}
                        title={`Overall: ${ordinal(r.overall.rank)} of ${rankedOverall} — ${
                          r.overall.points
                        } points from ${
                          r.overall.categories === r.overall.of
                            ? `all ${r.overall.of}`
                            : `${r.overall.categories} of ${r.overall.of}`
                        } categories, ${spanWords}`}
                      >
                        {ordinal(r.overall.rank)}
                      </span>
                    )}
                  </td>
                )}
                {groups.flatMap((g) => {
                  const tot = r.sides[g.side];
                  const sideN = rankedSide.get(g.side) ?? 0;
                  return [
                    /* **The group's own overall, leading it**, drawn as the
                       same cell shape as every category beside it — a value
                       with its rank under it — so the reader learns one thing
                       rather than two. The value goes **up** with quality like
                       every other value in the table, which is what points buy
                       over a mean of ranks. */
                    <td key={`side-${g.side}`} className="lg-num lg-side-col">
                      {tot ? tot.points : '—'}
                      {tot && (
                        <span
                          className="col-rank"
                          style={rankBadge(tot.rank, sideN)}
                          title={`${g.label} overall: ${ordinal(tot.rank)} of ${sideN} — ${
                            tot.points
                          } points from ${
                            tot.categories === tot.of ? `all ${tot.of}` : `${tot.categories} of ${tot.of}`
                          } ${g.label.toLowerCase()} categories, ${spanWords}`}
                        >
                          {ordinal(tot.rank)}
                        </span>
                      )}
                    </td>,
                    ...g.categories.map((c) => {
                      const v = r.values[c.statId];
                      const rank = r.ranks[c.statId];
                      const n = ranked.get(c.statId) ?? 0;
                      const badge = rankBadge(rank, n);
                      return (
                        <td key={c.statId} className="lg-num">
                          {fmtValue(v, c)}
                          {/* The rank under the value, in the slot the research
                              board's own percentile badge takes — `.col-rank`,
                              folded onto rather than restyled, so a second line
                              under a number is one object in this app. What this
                              table adds is the fill: the scale rides as a custom
                              property, so the color is computed here (where the
                              rank and its population are) and painted there
                              (where the chip's shape and its contrast rule
                              live). */}
                          {typeof rank === 'number' && (
                            <span
                              className="col-rank"
                              style={badge}
                              title={`${c.name}: ${ordinal(rank)} of ${n} — ${spanWords}`}
                            >
                              {ordinal(rank)}
                            </span>
                          )}
                        </td>
                      );
                    }),
                  ];
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What `OVR`, `BAT` and `PIT` are, in the fewest words that leave nothing out.
 *
 * **Written from the league rather than about a league**, which is what keeps
 * it honest and short at once: the team count and the category counts come off
 * the rankings themselves, so a twelve-team 5×5 reads "1st of 12 is worth 12"
 * and "the 5 categories on that side" while somebody else's eight-team league
 * reads its own. A worked example in the reader's own numbers beats a formula.
 *
 * **Four short paragraphs**: the scale, the sum, what `OVR` adds to it, and the
 * one rule that is not visible on the table (a tie takes the better points,
 * because the ranks it is computed from share a rank). Everything else about
 * the method is in `espn.ts`, where the argument for points over a mean of
 * ranks lives; a key is not the place for it.
 *
 * **`OVR` gets a sentence of its own and it is the one worth having**: that it
 * is `BAT` plus `PIT`. A derived figure a reader can check by adding the two
 * columns beside it is a figure they can trust, and saying so costs six words.
 */
export function RankKey({ rankings }: { rankings: EspnRankings }) {
  const n = rankings.rows.length;
  const groups = categoryGroups(rankings.categories);
  const bat = groups.find((g) => g.side === 'batting')?.categories.length ?? 0;
  const pit = groups.find((g) => g.side === 'pitching')?.categories.length ?? 0;
  // The two sides almost always have the same count (a 5×5 league is five and
  // five), and where they do the sentence says it once rather than twice.
  const counts =
    bat && pit && bat !== pit
      ? `${bat} batting or ${pit} pitching categories`
      : `${bat || pit} categories on that side`;
  const per = bat || pit;
  const hasOverall = rankings.rows.some((r) => r.overall);
  return (
    <InfoKey label="How OVR, BAT and PIT are worked out" className="lg-rank-key">
      <p>
        <strong>BAT</strong> and <strong>PIT</strong> are how a team stands across one whole
        side of the ball.
      </p>
      <p>
        Each category is worth points by where you rank in it — <strong>1st of {n} is
        worth {n}</strong>, last is worth 1 — and the column is those points added up over
        the {counts}. The badge under it ranks those totals.
      </p>
      {hasOverall ? (
        <p>
          <strong>OVR</strong> is the same over every category, so it is{' '}
          <strong>BAT + PIT</strong>: {n * rankings.categories.length} is first in all{' '}
          {rankings.categories.length} and {rankings.categories.length} is last in all of
          them.
        </p>
      ) : (
        <p>
          So {n * per} is first in every one of them and {per} is last in every one.
        </p>
      )}
      <p>A tie takes the better points, exactly as it shares a rank.</p>
    </InfoKey>
  );
}

export default function LeagueRankings({
  rankings,
  span,
  weeks,
  onSpan,
  onWeek,
  loading,
  error,
  matchupTeams,
  onOpenTeamMatchup,
  paneChrome,
}: {
  rankings: EspnRankings | null;
  span: EspnRankSpan;
  /**
   * **The league's own matchup weeks, in the schedule's order** — what the bar
   * below offers in place of a calendar, and it is the league's calendar rather
   * than a run of sevens: a period covers 12 scoring days at the start of the
   * season and 10 in a playoff round, and dating one from the other would be a
   * week that is right in June and wrong in April.
   *
   * Threaded from App off the **scoreboard**, which this tab already reads (its
   * rows are doors into that board — see *A Rankings row opens that team's
   * matchup*), so the picker costs no request of its own. Empty until the board
   * lands, which costs the bar its weeks group and nothing else: the five named
   * spans are on the rankings response and are in the list from the first frame.
   */
  weeks: EspnPeriodSpan[];
  /**
   * Which cut to read, and which week — two callbacks rather than one, because
   * they are two params in the URL and one of them clears the other.
   *
   * **Which week is in force is read off the response, not off a prop**, which
   * is rule 1 of the loading discipline stated for a control: the table on
   * screen stands while the next one is in flight, so a bar that jumped to
   * `Week 12` on the press would be describing a table that is not there yet.
   * `rankings.week` is the server's own answer and swaps with the figures.
   */
  onSpan: (span: EspnRankSpan) => void;
  onWeek: (period: number | null) => void;
  loading: boolean;
  error: string | null;
  /** Threaded from App, which holds the board this tab does not read. Null
   *  until it lands, which is what gates the press on a row. */
  matchupTeams: Map<number, number> | null;
  onOpenTeamMatchup: (teamId: number, matchupId: number) => void;
  /**
   * **The app's own tools row** — the League tabs, the `Projected` lens and,
   * on a narrow window, this table's own ⓘ — handed down rather than left in
   * the page, because this
   * tab is a fixed-height column in which only `.league-scroll` scrolls and a
   * sticky box sticks to *the box that scrolls*. Left above the pane the row is
   * held against a column that never moves, which is not stickiness at all but
   * a band that simply cannot leave; inside it, it scrolls away with the rows
   * and the header row takes the top of the pane behind it. The Roster's table
   * reading already does exactly this (`SummaryTable`'s `paneChrome`).
   *
   * It is rendered here wherever there is no pane to put it in — the wait, the
   * two empty states — so the League tabs never go missing from a page that has
   * nothing else on it. Not while expanded, where the fixed box covers the
   * page's chrome anyway and the caption is the whole of what the table is read
   * with.
   */
  paneChrome?: ReactNode;
}) {
  /**
   * **The page, for the widest table on this view.** It is fifteen columns on
   * the live league and every one of them is wanted at once, which is the
   * whole of the argument the three tables that already offer this make — and
   * this one is read inside a tab strip and a date bar, so it has more chrome
   * above it than any of them.
   *
   * The hook is called before the early returns because hooks must be, and it
   * costs nothing on a render that draws a message instead: with no table
   * there is no button, so the mode cannot be entered.
   */
  const { isFull, toggle, ref: fullRef } = useFullPage<HTMLDivElement>();
  /* The bar's own list. Called before the early returns for the reason above:
     hooks must be, and it costs nothing on a render that draws a message. */
  const [barOpen, setBarOpen] = useState(false);
  if (error && !rankings) {
    return (
      <>
        {paneChrome}
        <div className="empty-state">
          <h3>Couldn’t read your league</h3>
          <p>{error}</p>
        </div>
      </>
    );
  }

  // Never over data: a span change leaves the previous table standing while the
  // next is in flight, and the block wait is only for a pane with nothing in it.
  if (!rankings) {
    return (
      <>
        {paneChrome}
        {loading ? <LoadingBlock>Reading your league’s rankings</LoadingBlock> : null}
      </>
    );
  }

  /* **The server's answer wins over the request**, which is what `rankings.week`
     being an object rather than a flag buys: a week it could not serve comes
     back null with the span's figures under it, so the bar states the table
     that is actually on screen rather than the one that was asked for. */
  const shown: EspnRankSpan = rankings.week
    ? 'week'
    : rankings.spans.some((s) => s.span === span)
      ? span
      : rankings.span;
  const info = rankings.week ?? rankings.spans.find((s) => s.span === shown);
  /* Which period is the one being played. Off the `matchup` span's own periods
     rather than a second field: that span *is* "the week being played", so the
     two cannot come apart. */
  const livePeriod = rankings.spans.find((s) => s.span === 'matchup')?.periods?.[0] ?? null;
  /* The single week in force, if the table is of one — a picked one, or the
     live one under `Current matchup`. Null over a span of several, which is
     what turns the arrows off. */
  const onePeriod = rankings.week?.periods?.[0] ?? (shown === 'matchup' ? livePeriod : null);
  /* **Picking the week being played selects `Current matchup`, not that week.**
     The five spans are rules and the weeks are ranges, and the live week is the
     one period that is both: as a rule it is still true tomorrow, as a range it
     is frozen the moment the link is shared. It is the same normalization the
     scoreboard's `mp=` makes by being absent on the current period. */
  const pickPeriod = (period: number) => {
    if (period === livePeriod) {
      onWeek(null);
      onSpan('matchup');
    } else {
      onWeek(period);
    }
    setBarOpen(false);
  };
  const at = onePeriod == null ? -1 : weeks.findIndex((w) => w.period === onePeriod);
  const stepTo = (delta: -1 | 1) => {
    const next = at < 0 ? undefined : weeks[at + delta];
    return next ? () => pickPeriod(next.period) : null;
  };
  const face = rankFace(info, rankings);

  /**
   * **Which weeks these numbers are, as the app's own date bar.**
   *
   * It was a caption — one muted line reading `Week 19 · Aug 10 – Aug 16 · so
   * far`, with an ⓘ beside it — and a caption is a thing you read and cannot
   * act on. The five named cuts of the season were a strip a tier above it, and
   * between them they could not answer the commonest question a league table
   * gets asked: *what did week 12 look like.* Nineteen weeks is not a strip, and
   * a caption is not a control.
   *
   * So the row is `DateBar` outright — the same object the Roster's dates are
   * and the same one the Scoreboard's week is now, folded in the JSX rather than
   * restyled: two arrows that step a week, the two lines in the middle, and the
   * league's own calendar behind a press of them. Everything a popover in this
   * app owes — Escape undoing exactly this, an outside press spent on the
   * closing, a measured cap on a list as long as the season — arrives with the
   * component rather than being stated again here.
   *
   * **The list holds both kinds of thing**, because the bar has to be a whole
   * control rather than half of one: the five spans first (they are the cuts a
   * reader reaches for) and every week under them. **It is the only door now**:
   * the five were also a strip up in the tools row, argued as a fast path to
   * them — "one door, two ways in" — and that reversed once the list held the
   * same five off the same `rankings.spans`. A second control naming one of two
   * things the first control also names is a second control to keep in step
   * about which of them is lit, and the strip needed a rule of its own for the
   * week it could not name. Gone, the bar says what the table is of and nothing
   * else claims to.
   *
   * **The arrows step weeks and go off where there is no week to step from.**
   * A span of several has no next one — `First half` is not a position in a run
   * — so they dim rather than vanish, which is the rule the scoreboard's forward
   * arrow already follows and for the same reason: a control that comes and goes
   * is harder to aim at than one that dims, and its absence would say nothing
   * about why.
   */
  const bar = (
    <DateBar
      reading={{ kind: 'label', lead: face.lead, range: face.range }}
      /* Handed the span's own ends, which is what the face prints: these days
         are ESPN's arithmetic over the league's calendar rather than a range
         these arrows step through a day at a time. */
      start={info?.start ?? ''}
      end={info?.end ?? ''}
      open={barOpen}
      onToggle={() => setBarOpen((o) => !o)}
      onClose={() => setBarOpen(false)}
      onPrev={stepTo(-1)}
      onNext={stepTo(1)}
      prevTitle={onePeriod == null ? 'Pick a week to step through them' : 'The week before'}
      nextTitle={onePeriod == null ? 'Pick a week to step through them' : 'The week after'}
      popoverLabel="Pick a span or a week"
      /**
       * **And the ⓘ that explains `OVR`, `BAT` and `PIT` sits inside the bar's
       * far arrow**, in the collapsed row rather than in anything a press of
       * the face opens.
       *
       * It stood in the tools row, beside the projection's key, on the
       * reasoning that a key belongs with the other buttons — and the reason it
       * was put there rather than here is recorded in this file's own comment
       * and in `App.tsx`: a fourth thing in a three-column grid "would either
       * break the centering the bar's own grid exists for or take a third of
       * the middle column on a 320px phone". `endSlot` answers the first half
       * outright — a mirrored ghost keeps the face on the bar's center line,
       * measured at 0.00px offset from 320 to 1920.
       *
       * **The second half is not answered, it is paid.** It cost the face 68px
       * of middle column, and for one revision that was bought off with a
       * breakpoint: below 432 the pair collapsed and App kept a narrow copy of
       * this key. That is gone. A key is read once, and one that moves between
       * a phone and a desktop is one the reader has to find twice — so the
       * five tracks hold at every width and the face truncates instead
       * (measured at 320: 212 → 152px, the range losing its trailing
       * `· so far`; nothing clips from 390 up).
       *
       * **Beside the two arrows rather than beyond them**, which is the whole
       * of what `[step][ghost][face][key][step]` buys over
       * `[ghost][step][face][step][key]`: the arrows are the bar's outer edge
       * on every other surface in the app, and a control parked outside them
       * made this one bar end differently from the other three.
       *
       * The argument for the move off the tools row is that **the span strip it
       * used to sit beside is gone**: the five cuts are the first group of the
       * bar's own list, so the tools row held a key to a table whose one
       * remaining control is this bar.
       *
       * `rankings` is in hand here — this is below the wait and the two empty
       * states — so the key is drawn only once there is a table to explain,
       * which is the test it already carried up in the tools row.
       */
      endSlot={<RankKey rankings={rankings} />}
      /**
       * **Publish this bar's height**, which is what holds the table's header
       * row directly under it rather than behind it.
       *
       * `DateBar`'s own rule for `measure` is that the app's bar passes it and
       * nobody else does, because the property is the `top` a sticky header row
       * is held at and there is one such table on screen at a time under one
       * such bar. That is exactly this bar: the app's own is not drawn on the
       * League view at all, and this one is the pane's chrome over the one wide
       * table on it. Measured rather than declared for that rule's reason — the
       * bar is a control height plus a line of text in a font this app does not
       * choose, and 54 is not a number a stylesheet can know.
       *
       * The expanded box draws this bar *above* the pane, where the header row
       * has nothing to clear — `.lg-rankings:not(.is-expanded) .league-scroll`
       * is where that is answered, in one selector rather than a prop, exactly
       * as `.summary-scroll.has-pane-chrome` answers it one view over.
       */
      measure
      popover={
        <PeriodPicker
          groups={[
            {
              key: 'spans',
              heading: 'Spans',
              rows: rankings.spans.map((sp) => ({
                key: sp.span,
                label: sp.label,
                detail: spanDetail(sp) || sp.label,
                on: !rankings.week && sp.span === shown,
                pick: () => {
                  onWeek(null);
                  onSpan(sp.span);
                  setBarOpen(false);
                },
              })),
            },
            {
              key: 'weeks',
              heading: 'Weeks',
              /* Newest first — the weeks a manager looks back at are the ones
                 just behind the one being played, so ascending would put the
                 common errand at the bottom of a scrolling list. */
              rows: [...weeks].reverse().map((w) => ({
                key: String(w.period),
                label: `Week ${w.period}`,
                detail: periodDays(w),
                on: w.period === onePeriod,
                pick: () => pickPeriod(w.period),
              })),
            },
          ]}
        />
      }
    />
  );

  const empty =
    rankings.categories.length === 0 ? (
      <div className="empty-state">
        <h3>No scoring categories</h3>
        <p>
          ESPN scores this league as <code>{rankings.scoringType}</code>, which has no
          categories to rank teams in — so there is nothing for this tab to draw. The
          Scoreboard tab is what the league has.
        </p>
      </div>
    ) : rankings.rows.every((r) => Object.keys(r.values).length === 0) ? (
      <div className="empty-state">
        <h3>Nothing played in {info?.label.toLowerCase() ?? 'this span'} yet</h3>
        <p>ESPN has no category totals for these weeks, so there is nothing to rank.</p>
      </div>
    ) : null;

  if (empty) {
    return (
      <>
        {paneChrome}
        <div ref={fullRef} className="lg-rankings">
          {bar}
          {empty}
        </div>
      </>
    );
  }

  return (
    <div ref={fullRef} className={`lg-rankings${isFull ? ' is-expanded' : ''}`}>
      {/* Expanded, the bar stands above the pane as the caption always did:
          that box covers the app's chrome, so this row is the whole of what the
          table is read with, and one that scrolled away with the rows would
          take the reader's only statement of which weeks these are with it. The
          tools row is not drawn there at all — the box covers it.

          **And in that mode the statement is also the control**, which the
          caption could not be: an expanded table states its settings, and this
          one now lets the reader change the one setting it states without
          leaving the mode to do it. */}
      {isFull && bar}
      <RankTable
        rankings={rankings}
        categories={rankings.categories}
        matchupTeams={matchupTeams}
        onOpenTeamMatchup={onOpenTeamMatchup}
        corner={<ExpandButton isFull={isFull} onToggle={toggle} what="table" />}
        paneChrome={
          isFull ? null : (
            <>
              {paneChrome}
              {bar}
            </>
          )
        }
      />
    </div>
  );
}
