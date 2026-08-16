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
 * server answers with the spans it can serve honestly (`spans`) and the strip
 * is drawn from that — so a season whose All-Star break ESPN's calendar does
 * not show has no halves at all, and April has no second half, rather than
 * either being drawn empty. See `espn.ts`, **The Rankings tab**, for what each
 * span is made of and what was measured to establish that it could be.
 */
import { useMemo, useState } from 'react';
import type {
  EspnCategory,
  EspnCategorySide,
  EspnRankSpan,
  EspnRankSpanInfo,
  EspnRankings,
} from '../types';
import { LoadingBlock } from './Loading';
import { TeamLogo, categoryGroups, fmtValue, prettyDate, record } from './LeagueView';

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
 * the bottom, grey in the middle.** It is a departure from a rule this codebase
 * states at length, so it is worth stating why here rather than leaving a
 * reader to find the contradiction: the research board's stat columns are
 * deliberately **monochrome** and its percentile badges deliberately `--faint`,
 * on the grounds that "colour is reserved for *state*" (see
 * `client-research.md`). That rule is right for a six-hundred-row leaderboard
 * whose job is to be *scanned* for names, where a heat map would be a second
 * colour system beside the live inning, the postponement and the trend. This
 * table is the other thing: **twelve rows read for standing**, with no live
 * state on it at all, and where the board says "here is a number, judge it" a
 * league table says "here is where you are". The colour *is* the reading, and
 * on a table this small it is the difference between finding your weak category
 * at a glance and reading twelve ordinals.
 *
 * **It is on the badge, where it used to wash the whole cell.** A cell wash had
 * to be a translucent layer over whatever ground the row resolved, so it could
 * only ever be faint (22% at its strongest) and it painted a colour across the
 * *value* as well as the rank — a figure tinted by its own standing, which is
 * the one thing a raw number on this page is there to avoid. On the chip the
 * scale can be strong enough to read at a glance and it stops where the claim
 * stops: `1st` is red, the figure beside it is just the figure.
 *
 * **It colours the rank, never the value**, which is what makes it right for a
 * `lowerBetter` category with no special case at all: the server has already
 * computed the rank with the direction baked in (`rankBy`, `1` is best whichever
 * way the category runs), so a 3.29 ERA and 232 home runs are both `1st` and
 * both take the same red. **Ties share a rank and so share a colour** by the
 * same construction.
 *
 * **The fill carries the scale and the text does not.** `--text` on these
 * grounds measures 5.1–5.7:1 at the ends and 12.8:1 in the middle, where
 * colouring the *text* instead — the obvious first move, and the one the old
 * badge made against the cell wash — puts a mid-luminance red on a
 * mid-luminance ground at 3.1:1, under the 4.5 an 11px label owes a reader.
 *
 * **`n` is the teams *ranked in that category*, not the twelve rows**, matching
 * the badge's own denominator: a team with no figure is out of the ranking
 * rather than at the bottom of it, so it gets no badge either.
 */
const BADGE_MAX = 48;

function rankBadge(rank: number | undefined, n: number): React.CSSProperties | undefined {
  if (typeof rank !== 'number' || !Number.isFinite(rank) || n < 2) return undefined;
  // 0 at the best rank, 1 at the worst; `d` is the distance from the middle, so
  // the scale passes through the neutral chip where a team is neither.
  const t = Math.min(1, Math.max(0, (rank - 1) / (n - 1)));
  const d = Math.abs(t - 0.5) * 2;
  const pct = Math.round(d * BADGE_MAX * 10) / 10;
  // The two ends are tokens on `.league-table` rather than hexes written here,
  // so the scale is one definition and the strength is the only thing computed;
  // `--panel-2` is the base they are mixed into, which is what makes the middle
  // of a category a plain neutral chip rather than no chip at all.
  return {
    '--rank-bg': `color-mix(in srgb, var(${t < 0.5 ? '--rank-hot' : '--rank-cold'}) ${pct}%, var(--panel-2))`,
  } as React.CSSProperties;
}

/**
 * What a span actually covers, in one line under the strip.
 *
 * It is not decoration. `First half` is a phrase, and which weeks and which
 * days it is made of is the whole of what makes the numbers under it readable —
 * the same argument the scoreboard's own header makes for printing its dates
 * beside `Week 19` rather than the week number alone. `so far` is the other
 * half of it: a span reaching into the week being played is a total to date,
 * and saying `Season` over a figure that stops on Tuesday would be a claim.
 */
export function spanDetail(info: EspnRankSpanInfo | undefined): string {
  if (!info) return '';
  const days =
    info.start && info.end
      ? info.start === info.end
        ? prettyDate(info.start)
        : `${prettyDate(info.start)} – ${prettyDate(info.end)}`
      : null;
  const weeks =
    info.periods == null
      ? null
      : info.periods[0] === info.periods[1]
        ? `Week ${info.periods[0]}`
        : `Weeks ${info.periods[0]}–${info.periods[1]}`;
  const parts = [weeks, days].filter(Boolean) as string[];
  if (info.span === 'season' && parts.length === 0) parts.push("ESPN's own season line");
  if (info.live) parts.push('so far');
  return parts.join(' · ');
}

type SortKey =
  | { kind: 'team' }
  | { kind: 'cat'; statId: number }
  | { kind: 'side'; side: EspnCategorySide };

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
}: {
  rankings: EspnRankings;
  categories: EspnCategory[];
}) {
  const [sort, setSort] = useState<SortKey>({ kind: 'team' });
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

  // The same denominator for the two overall columns: how many teams have a
  // total on that side at all, which is what its badge is a rank *of*.
  const rankedSide = useMemo(() => {
    const out = new Map<EspnCategorySide, number>();
    for (const g of groups) {
      out.set(g.side, rankings.rows.filter((r) => r.sides[g.side]).length);
    }
    return out;
  }, [groups, rankings.rows]);

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
        const ar =
          sort.kind === 'cat' ? a.ranks[sort.statId] : a.sides[sort.side]?.rank;
        const br =
          sort.kind === 'cat' ? b.ranks[sort.statId] : b.sides[sort.side]?.rank;
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
            <th scope="col" className="lg-logo-col" aria-label="Team badge" />
            {head({ kind: 'team' }, 'Team', 'The league standing', 'lg-name-col')}
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
            return (
              <tr key={r.teamId} className={r.teamId === rankings.myTeamId ? 'lg-row-mine' : undefined}>
                {/* Two cells, because only the badge pins. The name scrolls
                    away with the stats, which is the board's own rule for a
                    phone: what has to stay is the least that identifies the
                    row, and 168px of team name is paid for out of the
                    categories beside it. */}
                {/* The badge is where the reader's own row is marked, the accent
                    ring having replaced the wash that used to run across all
                    twelve cells — so the title names it too, a ring being a
                    thing you see rather than a thing you can read. */}
                <td
                  className="lg-logo-col"
                  title={
                    t
                      ? `${t.name} — ${record(t)}${r.teamId === rankings.myTeamId ? ' — your team' : ''}`
                      : undefined
                  }
                >
                  <TeamLogo team={t} />
                </td>
                <th scope="row" className="lg-name-col">
                  <span className="lg-row-name">
                    <span className="lg-row-title">{t?.name ?? `Team ${r.teamId}`}</span>
                    <span className="lg-row-sub">{t ? record(t) : ''}</span>
                  </span>
                </th>
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
                              property, so the colour is computed here (where the
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

export default function LeagueRankings({
  rankings,
  span,
  loading,
  error,
}: {
  rankings: EspnRankings | null;
  span: EspnRankSpan;
  loading: boolean;
  error: string | null;
}) {
  if (error && !rankings) {
    return (
      <div className="empty-state">
        <h3>Couldn't read your league</h3>
        <p>{error}</p>
      </div>
    );
  }

  // Never over data: a span change leaves the previous table standing while the
  // next is in flight, and the block wait is only for a pane with nothing in it.
  if (!rankings) {
    return loading ? <LoadingBlock>Reading your league's rankings</LoadingBlock> : null;
  }

  const shown = rankings.spans.some((s) => s.span === span) ? span : rankings.span;
  const info = rankings.spans.find((s) => s.span === shown);

  return (
    <div className="lg-rankings">
      {/* What the span covers, **directly above the table** rather than beside
          the strip that picks it. The strip is in the app's tab row now (see
          `App`), and this is not a control: it is the table's caption, which is
          where the research board keeps its own count line and for the same
          reason — the sentence describes what is under it, so it belongs
          against it rather than an inch away among the buttons. */}
      <p className="lg-span-detail">{spanDetail(info)}</p>

      {rankings.categories.length === 0 ? (
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
      ) : (
        <RankTable rankings={rankings} categories={rankings.categories} />
      )}
    </div>
  );
}
