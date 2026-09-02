import { useMemo } from 'react';
import type { MlbStandings, StandingsRecord, StandingsTeam } from '../types';
import { teamLogoUrl } from '../lib';
import { LoadingBlock } from './Loading';
import { SlidingTabs } from './TabSlider';

/**
 * # Where the thirty clubs stand
 *
 * The MLB view's second tab. **One board, one control over it** — how the clubs
 * are grouped — and nineteen columns of the season.
 *
 * ## The three groupings are three questions
 *
 *  1. **Division** — six tables, the shape a standings page has always had.
 *     *Who is winning the division.*
 *  2. **Wild Card** — the clubs not leading one, per league, with the cut line
 *     drawn after the third. *Who is getting in anyway.*
 *  3. **Overall** — all thirty in one table, best record first. *Who is
 *     actually good.* It was two tables of fifteen and is one of thirty: the
 *     other two groupings are races and are league-shaped by construction, so
 *     the question this one is left with is simply who is any good, and
 *     splitting that into American and National answers it twice.
 *
 * They are a grouping rather than three pages because the **rows are the same
 * rows**: one read answers all three, the server sending every club once with
 * the wild-card order beside it, so crossing between them is a re-grouping and
 * not a fetch. That is the same economy the research board's position pills
 * make.
 *
 * ## There was a span control, and three columns replaced it
 *
 * The tab offered the whole board over five spans — season, 60, 30, 15, 7 — as
 * a run of pills that became a `<select>` on a phone. **`L30`, `1st Half` and
 * `2nd Half` beside `L10` say more of what that control was reached for**, and
 * say it *at the same time as everything else*: how a club has been going
 * lately, and either side of the break, without leaving the row its season
 * record is on. A span control answers one of those at a time and makes the
 * reader hold the others in their head.
 *
 * It also takes a whole vocabulary out of the app — a span, a URL param, a
 * board that had to say in words which days it was drawn over, and the rule
 * that a window may not carry a season's columns. What is left is one board
 * that is always the season, which is what a standings page is.
 */

export type StandingsGroup = 'division' | 'wildcard' | 'league';

export const STANDINGS_GROUPS: { key: StandingsGroup; label: string; title: string }[] = [
  { key: 'division', label: 'Division', title: 'Six divisions, the way a standings page is read' },
  { key: 'wildcard', label: 'Wild Card', title: 'The clubs not leading a division, and the cut line' },
  {
    key: 'league',
    label: 'Overall',
    title: 'All thirty clubs in one table, best record first',
  },
];

/** MLB's own two, by id. Written out because the standings payload carries the
 *  id and not the name, and because these two strings are the one part of this
 *  board that has been stable for a century. */
const LEAGUE_NAMES: Record<number, string> = {
  103: 'American League',
  104: 'National League',
};

/** How many wild cards each league takes — the line drawn across the wild-card
 *  table. Three since 2022, and a constant rather than a count of anything on
 *  the wire: MLB publishes no field saying so, and deriving it from who is
 *  above `+0.0` would make the line move with the standings rather than being
 *  the thing the standings are read against. */
const WILD_CARDS = 3;

function rec(r: StandingsRecord | null): string {
  return r ? `${r.wins}-${r.losses}` : '—';
}

/** A run differential wears its sign, which is the whole of what it says — and
 *  it is the one number on this board that is allowed a color, because above or
 *  below zero *is* the reading rather than an emphasis on it. */
function diffCell(n: number): { text: string; className: string } {
  return {
    text: n > 0 ? `+${n}` : String(n),
    className: n > 0 ? 'mlb-diff-up' : n < 0 ? 'mlb-diff-down' : '',
  };
}

interface Column {
  key: string;
  /** The header. Short, because there are up to sixteen of them. */
  label: string;
  title: string;
  value: (t: StandingsTeam) => string;
  /** Where a cell says more than its text — the run differential's sign. */
  className?: (t: StandingsTeam) => string;
  /**
   * **This column opens a new group**, and gets a rule down its left edge.
   *
   * The board is sixteen columns wide and they are **four readings**, which the
   * order below already argues for at length and which nothing on screen said:
   * the *standing* (`W L PCT GB`), the *runs* behind it (`RS RA DIFF`), the
   * *run of games* (`STRK L10 L30` and the two halves), and the *splits*
   * (`HOME AWAY vs .500+ 1-RUN xW-L`), with the division board's `MAG` a fifth
   * of one. Sixteen evenly-spaced columns is a reader counting headers to find
   * out where `L10` stops meaning the same kind of thing as `HOME`.
   *
   * It marks the **start** of a group rather than the end of one, so the last
   * column never draws a rule against the table's own edge and adding a column
   * to the end of a group needs nothing said.
   */
  startsGroup?: boolean;
}

/**
 * Which columns this board draws — a function of the grouping alone now that
 * there are no spans, and of the grouping only in one place: **which way of
 * being behind the row is being read against.**
 */
function columnsFor(group: StandingsGroup): Column[] {
  const cols: Column[] = [
    { key: 'w', label: 'W', title: 'Wins', value: (t) => String(t.wins) },
    { key: 'l', label: 'L', title: 'Losses', value: (t) => String(t.losses) },
    { key: 'pct', label: 'PCT', title: 'Winning percentage', value: (t) => t.pct },
  ];
  // **Behind in the race the grouping is about.** On the wild-card board the
  // relevant gap is to the third wild card, not to a division leader the row is
  // no longer being read against — and drawing both would be one row answering
  // two questions.
  if (group === 'wildcard') {
    cols.push({
      key: 'wcgb',
      label: 'WCGB',
      title: 'Games behind the third wild card',
      value: (t) => t.wildCardGamesBack ?? '—',
    });
  } else {
    cols.push({
      key: 'gb',
      label: 'GB',
      title: group === 'league' ? 'Games behind the best record in baseball' : 'Games behind the leader',
      value: (t) => t.gamesBack,
    });
  }
  cols.push(
    // **The three run columns straight after the race**, which is the one place
    // on this board where the order is an argument rather than a habit. `W`,
    // `L`, `PCT` and `GB` are the standing; `RS`, `RA` and `DIFF` are the
    // nearest thing to a reason for it, and a differential read beside the
    // record it produced is a different column from one read after eight
    // columns of splits. They led to `STRK` before, which put a five-game
    // streak between a club's record and its run differential — the two figures
    // a reader compares clubs on — and left the run columns adrift in the
    // middle of the board.
    { key: 'rs', label: 'RS', title: 'Runs scored', value: (t) => String(t.runsScored), startsGroup: true },
    { key: 'ra', label: 'RA', title: 'Runs allowed', value: (t) => String(t.runsAllowed) },
    {
      key: 'diff',
      label: 'DIFF',
      title: 'Run differential',
      value: (t) => diffCell(t.runDiff).text,
      className: (t) => diffCell(t.runDiff).className,
    },
    // **The run-of-games cuts together**, coarsest last: the streak, the last
    // ten, the last thirty, and then the season's two halves. They are one
    // reading — *how has this club been going* — and a reader comparing them
    // wants them adjacent rather than separated by three columns of runs.
    { key: 'strk', label: 'STRK', title: 'Current run of wins or losses', value: (t) => t.streak ?? '—', startsGroup: true },
    { key: 'l10', label: 'L10', title: 'Record in the last ten games', value: (t) => rec(t.lastTen) },
    { key: 'l30', label: 'L30', title: 'Record in the last thirty games', value: (t) => rec(t.lastThirty) },
    {
      key: 'h1',
      label: '1st Half',
      title: 'Record before the All-Star break',
      value: (t) => rec(t.firstHalf),
    },
    {
      key: 'h2',
      label: '2nd Half',
      title: 'Record since the All-Star break',
      value: (t) => rec(t.secondHalf),
    },
    { key: 'home', label: 'HOME', title: 'Record at home', value: (t) => rec(t.home), startsGroup: true },
    { key: 'away', label: 'AWAY', title: 'Record on the road', value: (t) => rec(t.away) },
    {
      key: 'vs500',
      label: 'vs .500+',
      title: 'Record against clubs at .500 or better',
      value: (t) => rec(t.vsOver500),
    },
    { key: 'onerun', label: '1-RUN', title: 'Record in one-run games', value: (t) => rec(t.oneRun) },
    {
      key: 'xwl',
      label: 'xW-L',
      title: "MLB's Pythagorean record — what the runs say the record should be",
      value: (t) => rec(t.expected),
    },
  );
  // The magic number is a fact about winning a **division**, so it is drawn on
  // the board that is about winning one and nowhere else.
  if (group === 'division') {
    cols.push({
      key: 'mag',
      label: 'MAG',
      title: 'Magic number to clinch the division',
      value: (t) => t.magicNumber ?? '—',
      startsGroup: true,
    });
  }
  return cols;
}

/** One league's rows, in the order the grouping asks for. */
interface Group {
  key: string;
  /** The table's caption — `AL East`, `American League Wild Card`. */
  title: string;
  rows: StandingsTeam[];
  /** Where the wild-card cut line falls, as a row index; null on every other
   *  board. Drawn *under* the row at this index. */
  cutAfter: number | null;
}

function groupsFor(data: MlbStandings, group: StandingsGroup): Group[] {
  const byId = new Map(data.teams.map((t) => [t.id, t]));
  if (group === 'division') {
    return data.divisions
      // American first, then National, and each league's divisions in MLB's own
      // East–Central–West reading order — which its `divisions` payload does not
      // come in, and which nobody wants to see a standings page in any other way.
      .slice()
      .sort((a, b) => a.leagueId - b.leagueId || DIVISION_ORDER.indexOf(a.id) - DIVISION_ORDER.indexOf(b.id))
      .map((d) => ({
        key: `d${d.id}`,
        title: d.shortName,
        rows: data.teams
          .filter((t) => t.divisionId === d.id)
          .sort((a, b) => a.divisionRank - b.divisionRank),
        cutAfter: null,
      }));
  }
  if (group === 'wildcard') {
    return data.wildcard
      .slice()
      .sort((a, b) => a.leagueId - b.leagueId)
      .map((w) => ({
        key: `w${w.leagueId}`,
        title: `${LEAGUE_NAMES[w.leagueId] ?? 'League'} Wild Card`,
        // The server's order, not a sort of ours — on the season board it is
        // MLB's own, tiebreakers and all. A club it names that this board has
        // no row for is dropped rather than drawn empty.
        rows: w.teamIds.map((id) => byId.get(id)).filter((t): t is StandingsTeam => t !== undefined),
        cutAfter: WILD_CARDS - 1,
      }));
  }
  // **One table of thirty, not two of fifteen.** This grouping is the one that
  // is *not* about a race — Division is who wins a division and Wild Card is
  // who gets in behind them, both of which are league-shaped by construction.
  // The question left over is simply *who is any good*, and splitting that into
  // American and National answers it twice with two clubs that never meet at
  // the top of each. MLB's own `sportRank` is the order.
  const all = [...data.teams].sort((a, b) => a.overallRank - b.overallRank);
  const lead = all[0];
  return [
    {
      key: 'all',
      title: 'All clubs',
      // **Games behind is recomputed here and nowhere else.** `gamesBack` on
      // the wire is MLB's own and is a club's distance from *its division
      // leader* — the right number on two of the three boards and a wrong one
      // here, where the row above is not in the same division. (It was wrong on
      // the old two-tables-of-fifteen reading too, and quietly: a Yankees row
      // said 3.5 against Tampa Bay while sitting under a Milwaukee it was
      // nowhere near.) The arithmetic is MLB's — half the sum of the win gap
      // and the loss gap — so the column means the same thing on all three.
      rows: lead
        ? all.map((t) =>
            t === lead ? t : { ...t, gamesBack: gamesBack(t, lead) },
          )
        : all,
      cutAfter: null,
    },
  ];
}

/** Games behind, in MLB's own form: `-` for whoever leads, one decimal
 *  otherwise, and half the sum of the win gap and the loss gap — which is MLB's
 *  arithmetic, so the recomputed column and the two that come off the wire
 *  cannot come to mean different things. */
function gamesBack(t: StandingsTeam, lead: StandingsTeam): string {
  const gb = (lead.wins - t.wins + (t.losses - lead.losses)) / 2;
  return gb <= 0 ? '-' : gb.toFixed(1);
}

/** East, Central, West — MLB's own ids in the order a standings page reads
 *  them, for both leagues at once. The payload's order is neither. */
const DIVISION_ORDER = [201, 202, 200, 204, 205, 203];

export default function MlbStandingsTab({
  data,
  group,
  onGroup,
  loading,
  error,
  onOpenTeam,
}: {
  data: MlbStandings | null;
  group: StandingsGroup;
  onGroup: (group: StandingsGroup) => void;
  loading: boolean;
  error: string | null;
  onOpenTeam: (teamId: number) => void;
}) {
  const groups = useMemo(() => (data ? groupsFor(data, group) : []), [data, group]);
  const columns = useMemo(() => columnsFor(group), [group]);
  return (
    <div className="mlb-standings">
      {/* **One control, and it is three pills.** It was two, and the second —
          the span — is gone with the board it changed; three columns beside
          `L10` say what it was reached for and say it on the row. What is left
          fits everywhere: the run measures 243px against the 276 the app's
          gutters leave at 320, so there is no `<select>` fallback and no width
          at which this row is anything but one line. */}
      <div className="mlb-standings-tools">
        <SlidingTabs className="view-switch" label="Standings grouping">
          {STANDINGS_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={g.key === group}
              className={`view-tab${g.key === group ? ' active' : ''}`}
              onClick={() => onGroup(g.key)}
              title={g.title}
            >
              {g.label}
            </button>
          ))}
        </SlidingTabs>
      </div>
      <Body
        data={data}
        groups={groups}
        columns={columns}
        loading={loading}
        error={error}
        onOpenTeam={onOpenTeam}
      />
    </div>
  );
}

function Body({
  data,
  groups,
  columns,
  loading,
  error,
  onOpenTeam,
}: {
  data: MlbStandings | null;
  groups: Group[];
  columns: Column[];
  loading: boolean;
  error: string | null;
  onOpenTeam: (teamId: number) => void;
}) {
  // Never over data — rule 1. The block wait is only for a pane with nothing
  // in it yet.
  if (!data) {
    if (error) {
      return (
        <div className="empty-state">
          <h3>Couldn&rsquo;t read the standings</h3>
          <p>{error}</p>
        </div>
      );
    }
    return loading ? <LoadingBlock>Reading the standings</LoadingBlock> : null;
  }
  /* **The board says nothing about itself in words, and that is deliberate.**
     Two captions stood here — one naming the days the rows were drawn over and
     one saying the line was the third wild card — and both were the page
     explaining a table that already reads. The days went with the span control
     (there is one span now, the season, which is what a standings page *is*),
     and the line needs no caption: a rule drawn after the third row of a board
     titled `American League Wild Card` is the one thing on it a reader is
     looking for. Prose that restates the drawing is prose a reader learns to
     skip, and then skips over the sentence that would have mattered. */
  return (
    <>
      {groups.map((g) => (
        <StandingsTable key={g.key} group={g} columns={columns} onOpenTeam={onOpenTeam} />
      ))}
    </>
  );
}

/**
 * One group's table.
 *
 * **It measured its own scroller once and no longer does.** The sticky club
 * column carried `--pin-edge`, and whether to draw that edge depended on
 * whether the table overflowed — which no media query can know, since it turns
 * on how wide `Arizona Diamondbacks` renders in a font this app does not
 * choose. So this component ran `useOverflowArrows` and put `is-pinned` on the
 * table.
 *
 * The edge is gone at every width (see `.mlb-standings-table .glog-date` in the
 * stylesheet for why), so the measurement has no reader and went with it. What
 * is left is a plain component, kept as one because a nineteen-column table
 * drawn six times is worth a name.
 */
function StandingsTable({
  group,
  columns,
  onOpenTeam,
}: {
  group: Group;
  columns: Column[];
  onOpenTeam: (teamId: number) => void;
}) {
  return (
    <section className="mlb-standings-block">
      <h3 className="mlb-standings-title">{group.title}</h3>
      <div className="mlb-standings-scroll">
        <table className="mlb-standings-table">
          <caption className="sr-only">{group.title}</caption>
          <thead>
            <tr>
              <th scope="col" className="glog-date">
                Team
              </th>
              {columns.map((c) => (
                <th
                  scope="col"
                  key={c.key}
                  className={`glog-num${c.startsGroup ? ' mlb-col-group' : ''}`}
                  title={c.title}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((t, i) => (
              <tr
                key={t.id}
                /* The cut line is a border on the row above it rather than a
                   row of its own: a `<tr>` with a `<td colspan>` in it would be
                   a row in the table's own accessibility tree saying nothing,
                   and it would take the zebra stripe. */
                className={group.cutAfter === i ? 'mlb-cut' : undefined}
                onClick={() => onOpenTeam(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenTeam(t.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${t.name}, ${t.wins}-${t.losses}. Open the club's page.`}
              >
                {/* **The flex box is a `<span>` inside the cell, not the cell
                    itself**, and that is the fix for a reported fault rather
                    than a nesting preference. The `<td>` carried
                    `.mlb-club`'s `display: flex` directly, which takes it out
                    of `display: table-cell` — and `position: sticky` on a table
                    cell that is no longer a table cell is exactly the case
                    Safari declines to honor. Chrome held it (measured: both the
                    header and the body cells sit at `left: 0` through a 250px
                    scroll), which is why it shipped; the report was **"the
                    column header sticks but not the actual teams below it"**,
                    and the header is the one cell in this column that never had
                    the flex on it. One `<span>` puts the cell back to
                    `table-cell` and leaves the layout identical. */}
                <td className="glog-date">
                  <span className="mlb-club">
                    <img className="mlb-crest" src={teamLogoUrl(t.id)} alt="" aria-hidden="true" />
                    {/* **Both rendered, one chosen by the stylesheet** — the
                        swap this app already makes for every pill row that
                        becomes a `<select>`, and for the reason that one is
                        made in CSS rather than in JS: a component that measured
                        its own container would have to re-measure on every
                        resize to say the same thing a media query says once.
                        Which one is drawn, and the measurement behind the width
                        it changes at, are at `.mlb-club-abbr`. */}
                    <span className="mlb-club-name">{t.name}</span>
                    <span className="mlb-club-abbr">{t.abbreviation || t.name}</span>
                    {/* Clinched is a **state**, so it takes the app's one
                        colored mark on this board; a division leader who has not
                        clinched gets nothing, a mark on six of thirty rows every
                        day of the season saying only what the row it sits at the
                        top of already says. */}
                    {t.clinched && (
                      <span className="mlb-clinch" title="Clinched a playoff place">
                        x
                      </span>
                    )}
                  </span>
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`glog-num${c.startsGroup ? ' mlb-col-group' : ''} ${
                      c.className?.(t) ?? ''
                    }`}
                  >
                    {c.value(t)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

