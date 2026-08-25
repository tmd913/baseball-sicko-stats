import { useMemo, useRef } from 'react';
import type { MlbStandings, StandingsRecord, StandingsSpan, StandingsTeam } from '../types';
import { teamLogoUrl } from '../lib';
import { LoadingBlock } from './Loading';
import { ScrollRow, useOverflowArrows } from './TabStrip';

/**
 * # Where the thirty clubs stand
 *
 * The MLB view's second tab. **One board with two controls over it** — how the
 * clubs are grouped, and how much of the season is being counted — and every
 * column in it is over the span the second control names.
 *
 * ## The three groupings are three questions
 *
 *  1. **Division** — six tables, the shape a standings page has always had.
 *     *Who is winning the division.*
 *  2. **Wild Card** — the clubs not leading one, per league, with the cut line
 *     drawn after the third. *Who is getting in anyway.*
 *  3. **League** — all fifteen at once. *Who is actually good.*
 *
 * They are a grouping rather than three pages because the **rows are the same
 * rows**: one read answers all three, the server sending every club once with
 * the wild-card order beside it, so crossing between them is a re-grouping and
 * not a fetch. That is the same economy the research board's position pills
 * make.
 *
 * ## The spans are the research board's own five
 *
 * `season`, 7, 15, 30, 60 — `RESEARCH_WINDOWS`, deliberately, because that is
 * what *the last 15 days* already means in this app. A vocabulary of its own
 * here would be a reader asking two boards the same question and getting two
 * answers.
 *
 * **What a window cannot have, it does not draw.** Games behind and the streak
 * are computed over the window and mean what they say; the wild-card race, the
 * last ten games, one-run games, the Pythagorean record and the magic number
 * are facts about a *season*, so on a window those columns are not in the table
 * at all rather than being drawn as dashes or, worse, carried over. That is
 * `BoardProjection`'s rule: a season figure and a seven-day figure on one line
 * would be two arithmetics on one row.
 *
 * ## The numbers are MLB's on the season and ours on a window
 *
 * Which sounds like a caveat and is very nearly not one: the server's own
 * document records that the two agree on **all thirty clubs' wins, losses, runs
 * scored and runs allowed**, measured before any of this was built. What a
 * window really changes is which games are counted, and the caption says which
 * days those are.
 */

export type StandingsGroup = 'division' | 'wildcard' | 'league';

export const STANDINGS_GROUPS: { key: StandingsGroup; label: string; title: string }[] = [
  { key: 'division', label: 'Division', title: 'Six divisions, the way a standings page is read' },
  { key: 'wildcard', label: 'Wild Card', title: 'The clubs not leading a division, and the cut line' },
  { key: 'league', label: 'League', title: 'All fifteen clubs in each league at once' },
];

export const STANDINGS_SPANS: { span: StandingsSpan; label: string }[] = [
  { span: 'season', label: 'Season' },
  { span: 60, label: 'Last 60' },
  { span: 30, label: 'Last 30' },
  { span: 15, label: 'Last 15' },
  { span: 7, label: 'Last 7' },
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
}

/**
 * Which columns this board draws, which is a function of both controls: the
 * span decides what exists, and the grouping decides which of two ways of being
 * behind is the relevant one.
 */
function columnsFor(span: StandingsSpan, group: StandingsGroup): Column[] {
  const season = span === 'season';
  const cols: Column[] = [
    { key: 'w', label: 'W', title: 'Wins', value: (t) => String(t.wins) },
    { key: 'l', label: 'L', title: 'Losses', value: (t) => String(t.losses) },
    { key: 'pct', label: 'PCT', title: 'Winning percentage', value: (t) => t.pct },
  ];
  // **Behind in the race the grouping is about.** On the wild-card board the
  // relevant gap is to the third wild card, not to a division leader the row is
  // no longer being read against — and drawing both would be one row answering
  // two questions.
  if (group === 'wildcard' && season) {
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
      title: group === 'league' ? 'Games behind the league leader' : 'Games behind the leader',
      value: (t) => t.gamesBack,
    });
  }
  // Only on a window: on the season board `W` and `L` already add up to it,
  // where over seven days a club's game count is the thing that says whether
  // the row means anything at all.
  if (!season) {
    cols.push({ key: 'gp', label: 'GP', title: 'Games played in this span', value: (t) => String(t.gamesPlayed) });
  }
  cols.push({ key: 'strk', label: 'STRK', title: 'Current run of wins or losses', value: (t) => t.streak ?? '—' });
  if (season) {
    cols.push({ key: 'l10', label: 'L10', title: 'Record in the last ten games', value: (t) => rec(t.lastTen) });
  }
  cols.push(
    { key: 'rs', label: 'RS', title: 'Runs scored', value: (t) => String(t.runsScored) },
    { key: 'ra', label: 'RA', title: 'Runs allowed', value: (t) => String(t.runsAllowed) },
    {
      key: 'diff',
      label: 'DIFF',
      title: 'Run differential',
      value: (t) => diffCell(t.runDiff).text,
      className: (t) => diffCell(t.runDiff).className,
    },
    { key: 'home', label: 'HOME', title: 'Record at home', value: (t) => rec(t.home) },
    { key: 'away', label: 'AWAY', title: 'Record on the road', value: (t) => rec(t.away) },
    {
      key: 'vs500',
      label: 'vs .500+',
      title: 'Record against clubs at .500 or better',
      value: (t) => rec(t.vsOver500),
    },
  );
  if (season) {
    cols.push(
      { key: 'onerun', label: '1-RUN', title: 'Record in one-run games', value: (t) => rec(t.oneRun) },
      {
        key: 'xwl',
        label: 'xW-L',
        title: "MLB's Pythagorean record — what the runs say the record should be",
        value: (t) => rec(t.expected),
      },
    );
  }
  // The magic number is a fact about winning a **division**, so it is drawn on
  // the board that is about winning one and nowhere else.
  if (season && group === 'division') {
    cols.push({
      key: 'mag',
      label: 'MAG',
      title: 'Magic number to clinch the division',
      value: (t) => t.magicNumber ?? '—',
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
        // **Season only.** A wild-card race is a fact about the season; a line
        // across a seven-day board would say three clubs are in, off seven days
        // of baseball. The tables say so in a note instead.
        cutAfter: data.span === 'season' ? WILD_CARDS - 1 : null,
      }));
  }
  const leagues = [...new Set(data.teams.map((t) => t.leagueId))].sort((a, b) => a - b);
  return leagues.map((id) => ({
    key: `l${id}`,
    title: LEAGUE_NAMES[id] ?? 'League',
    rows: data.teams.filter((t) => t.leagueId === id).sort((a, b) => a.leagueRank - b.leagueRank),
    cutAfter: null,
  }));
}

/** East, Central, West — MLB's own ids in the order a standings page reads
 *  them, for both leagues at once. The payload's order is neither. */
const DIVISION_ORDER = [201, 202, 200, 204, 205, 203];

export default function MlbStandingsTab({
  data,
  span,
  onSpan,
  group,
  onGroup,
  loading,
  error,
  onOpenTeam,
}: {
  data: MlbStandings | null;
  span: StandingsSpan;
  onSpan: (span: StandingsSpan) => void;
  group: StandingsGroup;
  onGroup: (group: StandingsGroup) => void;
  loading: boolean;
  error: string | null;
  onOpenTeam: (teamId: number) => void;
}) {
  const groups = useMemo(() => (data ? groupsFor(data, group) : []), [data, group]);
  const columns = useMemo(() => columnsFor(span, group), [span, group]);
  return (
    <div className="mlb-standings">
      {/* **The two controls scroll rather than wrapping or shrinking.**
          Measured at 390 before: the row was **96px** — the span run is 358px
          wide and broke to a second line, and `Last 60` then wrapped *inside*
          its own pill, taking every span pill from 25px to 40. At 640 it was
          still 84. That is the fault `.view-tools` was given `ScrollRow` for,
          in this file's own words: a row of controls too wide for a phone gives
          up what is off the end and says so with two arrows, rather than
          shedding its words or growing a line. The pills are `nowrap` here so
          the second half of it cannot happen either. */}
      <ScrollRow label="the standings controls" className="mlb-standings-tools">
        <div className="view-switch" role="tablist" aria-label="Standings grouping">
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
        </div>
        <div className="view-switch" role="tablist" aria-label="Standings span">
          {STANDINGS_SPANS.map((s) => (
            <button
              key={String(s.span)}
              type="button"
              role="tab"
              aria-selected={s.span === span}
              className={`view-tab${s.span === span ? ' active' : ''}`}
              onClick={() => onSpan(s.span)}
              title={
                s.span === 'season'
                  ? "The whole season, in MLB's own numbers"
                  : `Every club's record over the last ${s.span} days`
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </ScrollRow>
      <Body
        data={data}
        groups={groups}
        columns={columns}
        group={group}
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
  group,
  loading,
  error,
  onOpenTeam,
}: {
  data: MlbStandings | null;
  groups: Group[];
  columns: Column[];
  group: StandingsGroup;
  loading: boolean;
  error: string | null;
  onOpenTeam: (teamId: number) => void;
}) {
  // Never over data — rule 1. A span change leaves the last board standing
  // while the next is in flight, and the block wait is only for a pane with
  // nothing in it yet.
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
  return (
    <>
      <p className="mlb-standings-note">
        {data.span === 'season' ? (
          <>Every club&rsquo;s season, in MLB&rsquo;s own numbers.</>
        ) : (
          <>
            Every club over the <strong>last {data.span} days</strong> &mdash; {prettyDay(data.start)} to{' '}
            {prettyDay(data.end)}, counting games that have finished.
          </>
        )}
        {group === 'wildcard' && data.span !== 'season' && (
          <>
            {' '}
            These are the clubs not leading a division, ranked by their record over these days; the
            wild-card race itself is a fact about the season.
          </>
        )}
      </p>
      {groups.map((g) => (
        <StandingsTable key={g.key} group={g} columns={columns} onOpenTeam={onOpenTeam} />
      ))}
    </>
  );
}

/**
 * One group's table.
 *
 * **A component of its own so that each one can measure its own scroller**, and
 * that is the whole reason it was split out: the pinned club column carries
 * `--pin-edge`, a shadow whose job is to say *there is more table under this*,
 * and a shadow drawn on a table that fits is a vertical bar down the middle of
 * the page saying nothing. Six division tables on one screen drew six of them.
 *
 * It is measured rather than declared, which is the app's standing rule for a
 * value that is a function of the window and of a font this app does not
 * choose: the season board fits at 1280 and scrolls at 900, and no media query
 * can know that because it depends on how wide `Arizona Diamondbacks` renders.
 * `useOverflowArrows` is the app's one implementation of that measurement —
 * every-render plus a `ResizeObserver`, with a pixel of slack so a table that
 * fits exactly does not draw an edge for the 0.4px it is over by — so it is
 * borrowed whole rather than written again. Only `over` is read here; the two
 * arrows it also answers for belong to a row of controls, not to a table with a
 * scrollbar of its own.
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
  const boxRef = useRef<HTMLDivElement | null>(null);
  const { state } = useOverflowArrows(boxRef, boxRef);
  return (
    <section className="mlb-standings-block">
      <h3 className="mlb-standings-title">{group.title}</h3>
      <div className="mlb-standings-scroll" ref={boxRef}>
        <table className={`mlb-standings-table${state.over ? ' is-pinned' : ''}`}>
          <caption className="sr-only">{group.title}</caption>
          <thead>
            <tr>
              <th scope="col" className="glog-date">
                Team
              </th>
              {columns.map((c) => (
                <th scope="col" key={c.key} className="glog-num" title={c.title}>
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
                <td className="glog-date mlb-club">
                  <img className="mlb-crest" src={teamLogoUrl(t.id)} alt="" aria-hidden="true" />
                  {/* **Both rendered, one chosen by the stylesheet** — the swap
                      this app already makes for every pill row that becomes a
                      `<select>`, and for the reason that one is made in CSS
                      rather than in JS: a component that measured its own
                      container would have to re-measure on every resize to say
                      the same thing a media query says once. Which one is drawn,
                      and the measurement behind the width it changes at, are at
                      `.mlb-club-abbr`. */}
                  <span className="mlb-club-name">{t.name}</span>
                  <span className="mlb-club-abbr">{t.abbreviation || t.name}</span>
                  {/* Clinched is a **state**, so it takes the app's one colored
                      mark on this board; a division leader who has not clinched
                      gets nothing, a mark on six of thirty rows every day of the
                      season saying only what the row it sits at the top of
                      already says. */}
                  {t.clinched && (
                    <span className="mlb-clinch" title="Clinched a playoff place">
                      x
                    </span>
                  )}
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={`glog-num ${c.className?.(t) ?? ''}`}>
                    {c.value(t)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {group.cutAfter !== null && <p className="mlb-cut-note">The line is the third wild card.</p>}
    </section>
  );
}

/** `Aug 11` — the same shape `lib.ts::prettyDate` gives, pinned to noon so a
 *  bare ISO date is not read as UTC midnight and drawn as the day before. */
function prettyDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
