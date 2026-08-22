import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useDelayedFlag } from '../hooks';
import { ordinal } from '../lib';
import { CardSection } from './PitcherCard';
import { LoadingBlock } from './Loading';
import { TEAM_HITTING_WINDOWS } from '../types';
import type {
  TeamHitting,
  TeamHittingLine,
  TeamHittingVenue,
  TeamHittingWindow,
  TeamSplitSide,
} from '../types';

/**
 * How a club's plate appearances have gone, whole and by the other man's hand,
 * over a span the reader picks and cut to home games, road games or both.
 *
 * **Two callers and two sides of the ball, one table.** A watched pitcher's
 * opponent table asks for the lineup he is facing — how *they* have hit, by the
 * hand on the mound — and the team page's Splits tab asks the same nine cuts of
 * a club at the plate *or* in the field. The second is the first read from the
 * other end: a club's pitching line **is** its opponents' batting line, off the
 * identical rows of the identical export (see `teamHitting.ts`), so what changes
 * here is three labels and a tooltip, not a table.
 *
 * **A table where this was three stat strips**, and the shape is the point. The
 * three rows are the same nine categories asked three ways, so a reader wants
 * to run their eye *down* a column — is this lineup worse against lefties, and
 * by how much — which three separate strips of label-and-value pairs make you
 * do by memory. Rows and columns is the app's own answer to that question
 * everywhere else it comes up: the research board, the Stats tab, the game log.
 *
 * **Every number keeps its league rank**, drawn as `.col-rank` under the value
 * — the research board's own percentile badge folded onto rather than
 * restyled, so a second line under a number is one object in this app. A rank
 * is what makes a team line readable at all: `.231` says nothing until you know
 * it is 28th. **1st is always the best club**, whichever end of the column that
 * is: on the batting side the fewest strikeouts ranks 1st rather than 30th, and
 * on the pitching side every one of the eight flips — fewest runs allowed,
 * lowest average against, *most* strikeouts. Every cut ranks within **its own**
 * population, a 30-day home line against the other 29 teams' 30-day home lines,
 * never against the season board and never against the other side of the ball.
 */

/**
 * The rows, in the order the reader asked for them: everyone, then the other
 * man's hand.
 *
 * **`vsLeft` is the left-handed *other man* on both sides** — the hand on the
 * mound when this club is batting, the hand at the plate when it is pitching —
 * so the field is one field and the label is a fact about whose side of the ball
 * it is. That is the economy `SplitCut` already makes on a player's page, where
 * `vsr` reads as *vs RHP* on a batter's and *vs RHB* on a pitcher's; the
 * alternative is two more fields on the wire saying the same thing twice.
 */
const ROWS: { key: 'all' | 'vsRight' | 'vsLeft'; label: string; hand: 'L' | 'R' | null }[] = [
  { key: 'all', label: 'Overall', hand: null },
  { key: 'vsRight', label: 'vs RH', hand: 'R' },
  { key: 'vsLeft', label: 'vs LH', hand: 'L' },
];

/** `P` on the batting side and `B` on the pitching one — the other man, which
 *  is what the row is a split by. */
const otherMan = (side: TeamSplitSide) => (side === 'batting' ? 'P' : 'B');

const VENUES: { key: TeamHittingVenue; label: string; title: string }[] = [
  { key: 'all', label: 'All Games', title: 'Every game' },
  { key: 'home', label: 'Home', title: 'Their home games only' },
  { key: 'away', label: 'Away', title: 'Their road games only' },
];

const WINDOW_LABEL: Record<string, string> = {
  season: 'Season', 7: '7d', 15: '15d', 30: '30d', 60: '60d',
};

/**
 * The columns. `rank` names the entry in `TeamHittingRanks` the cell's badge
 * reads, and the four that have none are counts a rank would say nothing about
 * — games played, and the plate appearances behind the rates.
 *
 * **The labels are the same ten on both sides and the tooltips are not.** A
 * club's pitching line is its opponents' batting line, so the *numbers* are
 * batting numbers whichever side you are reading — `AVG` on a pitching row is
 * the average against, `R/G` is runs allowed. Relabelling them (`AVG A`, `oAVG`,
 * `RA/G`) would be a second vocabulary for one set of figures, on a table whose
 * whole shape exists so a reader can run their eye *down* a column; what the
 * side genuinely changes is what the number *means*, and a meaning is what a
 * tooltip is for. The `title` is therefore a function of the side, and the two
 * that also change which end is best say so in it.
 */
const COLUMNS: {
  key: string;
  label: string;
  title: (side: TeamSplitSide) => string;
  of: (l: TeamHittingLine) => string;
  rank?: keyof NonNullable<TeamHittingLine['ranks']>;
}[] = [
  { key: 'g', label: 'G', title: () => 'Games in this cut', of: (l) => String(l.games) },
  {
    key: 'pa', label: 'PA',
    title: () => 'Plate appearances in this cut',
    of: (l) => String(l.pa),
  },
  {
    key: 'rg', label: 'R/G',
    title: (side) =>
      side === 'batting'
        ? 'Runs per game — on a hand row, runs scored off that hand over the games they faced one'
        : 'Runs allowed per game — on a hand row, runs allowed to that hand over the games they pitched to one',
    of: (l) => l.runsPerGame ?? '—', rank: 'runsPerGame',
  },
  {
    key: 'avg', label: 'AVG',
    title: (side) => (side === 'batting' ? 'Batting average' : 'Batting average against'),
    of: (l) => l.avg, rank: 'avg',
  },
  {
    key: 'obp', label: 'OBP',
    title: (side) => (side === 'batting' ? 'On-base percentage' : 'On-base percentage against'),
    of: (l) => l.obp, rank: 'obp',
  },
  {
    key: 'slg', label: 'SLG',
    title: (side) => (side === 'batting' ? 'Slugging' : 'Slugging against'),
    of: (l) => l.slg, rank: 'slg',
  },
  {
    key: 'ops', label: 'OPS',
    title: (side) =>
      side === 'batting' ? 'On-base plus slugging' : 'On-base plus slugging against',
    of: (l) => l.ops, rank: 'ops',
  },
  {
    key: 'hr', label: 'HR',
    title: (side) => (side === 'batting' ? 'Home runs' : 'Home runs allowed'),
    of: (l) => String(l.homeRuns), rank: 'homeRuns',
  },
  {
    key: 'k', label: 'K%',
    title: (side) =>
      side === 'batting'
        ? 'Strikeout rate — 1st is the fewest, this being a ranking of offenses'
        : 'Strikeout rate — 1st is the most, this being a ranking of pitching staffs',
    of: (l) => pct(l.kRate), rank: 'kRate',
  },
  {
    key: 'bb', label: 'BB%',
    title: (side) =>
      side === 'batting'
        ? 'Walk rate'
        : 'Walk rate allowed — 1st is the fewest, this being a ranking of pitching staffs',
    of: (l) => pct(l.bbRate), rank: 'bbRate',
  },
];

/** A stored `.231` share as the percent this table prints — `lib.ts`'s own rule
 *  for the two server lines that carry a share as a rate string. */
function pct(rate: string): string {
  const n = Number(rate);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—';
}

/**
 * **It takes the three things it reads, not a whole `PlayerGame`.**
 *
 * It used to take the game and pull `opponentHitting`, `opponent` and `stand`
 * off it, which was fine while every caller had one — the pitcher card, its
 * breakdown and the feed's Upcoming row all draw a game that has been played or
 * is about to be. The player page's **Projected Starts** block has no game at
 * all: a `ProjectedStart` is a `gamePk`, a date, an opponent id and an
 * abbreviation, placed on his club's remaining schedule (see `types.ts`). So the
 * parameter was a shape this table never wanted, and naming what it actually
 * reads is what lets one component serve both without a `PlayerGame` being faked
 * up around three fields.
 *
 * The alternative was a second, thinner drawing of the opposing lineup on the
 * player page, which is exactly the drift this codebase spends its comments
 * avoiding: nine cuts, three rows, ten columns, a span control, a venue control
 * and the accented hand row are a lot of decisions to keep two copies of.
 */
function OpponentBody({
  hitting: season,
  opponent,
  hand,
  side,
}: {
  /** The **season, all games** cut — this table's opening state. The other four
   *  spans are read here, on demand; see the effect below. */
  hitting: TeamHitting | null;
  /** The club, for the table's corner header. */
  opponent: string;
  /** The hand on the mound, which decides which row is accented. A team's split
   *  is by the hand they faced, so this is the pitcher's own throwing hand —
   *  `game.stand` where he has already thrown a pitch in the game, his report's
   *  `throws` before that, and on a start nobody has played yet only the latter
   *  exists. Resolving that is the caller's job, since only the caller knows
   *  whether it has a game to read a `stand` off. */
  hand: string | null;
  /** Which side of the ball these nine cuts are — what the rows and the
   *  tooltips are labelled from, and what the spans below are read with. */
  side: TeamSplitSide;
}) {
  const teamId = season?.teamId ?? null;
  const [window, setWindow] = useState<TeamHittingWindow>('season');
  const [venue, setVenue] = useState<TeamHittingVenue>('all');
  // Whichever windows have been read, keyed by span. The season arrived on the
  // report, so it is seeded here rather than fetched — the table's opening
  // state costs no request at all.
  const [boards, setBoards] = useState<Partial<Record<string, TeamHitting>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the reader presses the span that is already lit, which is the
  // only way a failed read can be asked for again: `setWindow` to the value it
  // already holds changes nothing, so without this the error line would promise
  // a retry the effect never runs.
  const [attempt, setAttempt] = useState(0);
  // Declared with the other hooks and above the `!season` bail, which every
  // hook in this component has to be.
  const waiting = useDelayedFlag(loading);

  /**
   * A span is read once and kept for the life of the card — a team's line over
   * a settled span does not move, and the server caches it six hours anyway.
   *
   * **What holds it to once is `boards` itself, and a ref beside it was a
   * bug.** This used to mark the span as asked *before* firing the request and
   * bail on a second pass that found the mark, which is fatal under
   * `StrictMode`: React mounts, tears down and re-runs, so pass one set the
   * mark and had its result thrown away by the teardown (`live` false, so
   * neither `setBoards` nor `setLoading(false)` ever ran) and pass two saw the
   * mark and returned. `loading` stayed true for ever and the block wait never
   * resolved. It reproduced only under `npm run dev`, React double-invoking in
   * development builds alone.
   *
   * Testing the state we already hold is both simpler and self-healing: a span
   * present in `boards` is a span that genuinely landed, where a mark set
   * up-front is only a claim that one was asked for. It costs `boards` a place
   * in the dependency list, which re-runs the effect on each arrival and
   * returns immediately — and it makes the failed-read retry fall out for
   * nothing, a span that errored being absent from `boards` and so asked again
   * the moment `attempt` moves.
   *
   * The same mistake, in the same shape, is recorded on the Matchup tab's
   * roster read; the rule is **never mark a request answered before it is
   * answered**, or unmark it in the cleanup.
   */
  /* **Keyed by side as well as span**, which is what makes a side switch cost
     nothing it has already read and — the half that matters — makes it
     impossible for one side's `15d` to be served under the other's lit tab. The
     season cut is not in here at all: it arrives as the `hitting` prop, which
     the caller re-reads when the side changes, and it carries its own `side` on
     the wire so it cannot be mislabelled either. */
  useEffect(() => {
    if (teamId === null || window === 'season') return;
    const w = `${side}|${window}`;
    if (boards[w]) return;
    let live = true;
    setLoading(true);
    setError(null);
    api
      .teamSplits(teamId, window, side)
      .then((board) => {
        if (!live || !board) return;
        setBoards((b) => ({ ...b, [w]: board }));
      })
      .catch(() => live && setError('span'))
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [teamId, window, side, attempt, boards]);

  if (!season) return null;

  const mine = hand === 'L' || hand === 'R' ? hand : null;

  const board = window === 'season' ? season : boards[`${side}|${window}`];
  const split = board?.[venue] ?? null;

  return (
    <div className="opp-block">
      <div className="opp-controls">
        <div className="view-switch opp-windows" role="tablist" aria-label="Span">
          {TEAM_HITTING_WINDOWS.map((w) => (
            <button
              key={String(w)}
              type="button"
              role="tab"
              aria-selected={w === window}
              className={`view-tab${w === window ? ' active' : ''}`}
              onClick={() => {
                if (w === window) setAttempt((n) => n + 1);
                else setWindow(w);
              }}
            >
              {WINDOW_LABEL[String(w)]}
            </button>
          ))}
        </div>
        <div className="view-switch opp-venues" role="tablist" aria-label="Games">
          {VENUES.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={v.key === venue}
              title={v.title}
              className={`view-tab${v.key === venue ? ' active' : ''}`}
              onClick={() => setVenue(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {!split ? (
        // The app's own loading discipline: a **block wait** because there is
        // nothing here yet — the previous span's numbers under a lit `15d` tab
        // would be a wrong label on a right table — and behind `WAIT_DELAY`,
        // because a span already read comes back in a tick and a wait that
        // appears and vanishes inside a tenth of a second reads as the page
        // breaking. The *content* is gated on the real flag, not the delayed
        // one, or a fast read would show a blank pane instead of a wait.
        waiting ? (
          <LoadingBlock>Reading {opponent}&rsquo;s line</LoadingBlock>
        ) : error ? (
          <div className="details-error opp-status">
            Couldn&rsquo;t read {opponent}&rsquo;s line — press the span again to retry.
          </div>
        ) : loading ? null : (
          /* Named by the club rather than as "the opponent", which was true of
             the one caller this had and is false on a club's own page — the
             Brewers are not the Brewers' opponent. The abbreviation is what
             every table in the app calls them and is what the corner header of
             this very table says. */
          <div className="opp-status">
            Nobody {side === 'batting' ? 'batted' : 'pitched'} for {opponent} in this span.
          </div>
        )
      ) : (
        <div className="opp-scroll">
          <table className="opp-table">
            <thead>
              <tr>
                <th className="glog-date opp-rowhead">{opponent}</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="glog-num" title={c.title(side)}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const line = split[row.key];
                // The row his hand makes relevant, marked the way the Splits
                // card marks the half that applies to a game: the accent, and
                // the reason in the title rather than a third line of text.
                const on = row.hand !== null && row.hand === mine;
                return (
                  <tr key={row.key} className={on ? 'opp-row-on' : undefined}>
                    <th
                      className="glog-date opp-rowhead"
                      title={
                        on
                          ? `${opponent} against ${row.hand === 'L' ? 'left' : 'right'}-handers — the half that applies to this game`
                          : row.hand
                            ? `${opponent} against ${row.hand === 'L' ? 'left' : 'right'}-handed ${side === 'batting' ? 'pitching' : 'batters'}`
                            : undefined
                      }
                    >
                      {/* `vs RHP` on the batting side and `vs RHB` on the
                          pitching one — the other man, whose hand this row is a
                          split by. The letter is appended rather than the label
                          being written out twice, so the two rows cannot come
                          to disagree about which hand they are. */}
                      {row.hand ? `${row.label}${otherMan(side)}` : row.label}
                    </th>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="glog-num">
                        {line ? (
                          <>
                            {c.of(line)}
                            {c.rank && line.ranks?.[c.rank] ? (
                              <span className="col-rank">{ordinal(line.ranks[c.rank]!)}</span>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * `collapsible` from first pitch on: once there is an outing under it this is
 * background to a card that has its own story to tell, so it takes the same
 * toggle bar the other sections carry and can be folded away. Before then it
 * stays a plain label — it is the whole point of a card with no outing, and a
 * toggle there would only offer to hide the one thing worth reading.
 */
export function OpponentSection({
  hitting,
  opponent,
  hand,
  collapsible = false,
  defaultOpen = false,
  bare = false,
  title = 'Opponent',
  side = 'batting',
}: {
  hitting: TeamHitting | null;
  opponent: string;
  hand: string | null;
  /** Which side of the ball. `batting` — how this club has hit — is what every
   *  caller but the team page's Splits tab means, and is what a pitcher's
   *  opponent table has always asked for. */
  side?: TeamSplitSide;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** No heading at all — for the outing page, whose tab strip has already said
   *  `Opponent`. See `CardSection`, where the three modes are argued. */
  bare?: boolean;
  /**
   * What the heading calls this club, and the default is what every caller but
   * one means: these nine cuts are drawn *about the other side*, and every
   * surface that had them until now was a pitcher's.
   *
   * The exception is the **club's own page**, where "Opponent" would be flatly
   * false — the Brewers are not the Brewers' opponent — and the same table is
   * headed `Hitting` instead. A word, not a second component: the nine cuts,
   * the three rows, the ten columns and the two controls are identical, and the
   * heading is the only thing that knows whose lineup this is.
   */
  title?: string;
}) {
  if (!hitting) return null;
  const body = <OpponentBody hitting={hitting} opponent={opponent} hand={hand} side={side} />;
  if (bare) return <div className="card-section">{body}</div>;
  return collapsible ? (
    <CardSection title={title} defaultOpen={defaultOpen}>
      {body}
    </CardSection>
  ) : (
    <div className="card-section">
      <div className="section-title opp-title">{title}</div>
      {body}
    </div>
  );
}

/**
 * What a caller has learned about one opposing club's season line: nothing yet,
 * a read in flight, a read that threw, or an answer — which may itself be
 * `null`, the server's honest "no board for that club".
 */
export type OppRead = { board?: TeamHitting | null; loading?: boolean; error?: boolean };

/**
 * The club-line cache two lists of dated rows share.
 *
 * **It was `ProjectedStartsBlock`'s own state** and is now the Schedule tab's
 * as well — both are lists where a row is a press that opens an opposing
 * lineup — so it lives beside the table it feeds rather than inside either
 * list. That is the move `GameLogTable` and `NewsList` already made when a
 * preview and a tab came to draw one thing, and here it also keeps the two
 * player-page files from importing each other: the Overview draws the Schedule
 * tab's block, so the Schedule tab must not have to reach back for this.
 *
 * **Lazily, on the press, and held.** A reader who opens no row costs the
 * server nothing; a three-game series against one club costs one read; and
 * closing a dialog and reopening it costs none. `key` is the player the list is
 * about — a different man is a different list of clubs, and the ids would
 * collide harmlessly (a club's line is a club's line) but the cache is his.
 *
 * **The mark comes off on failure**, which is the one departure from the rule
 * this codebase states at length elsewhere — *never mark a request answered
 * before it is answered*. Here the mark says "asked", the answer always lands
 * (this is a press handler, not an effect with a cleanup that could discard
 * it), and unmarking in the `catch` is what makes the dialog's `Try again` a
 * retry rather than a no-op.
 */
export function useOpponentBoards(key: number) {
  const [opps, setOpps] = useState<Record<number, OppRead>>({});
  const asked = useRef<Set<number>>(new Set());
  useEffect(() => {
    asked.current = new Set();
    setOpps({});
  }, [key]);
  const load = useCallback((teamId: number) => {
    if (asked.current.has(teamId)) return;
    asked.current.add(teamId);
    setOpps((p) => ({ ...p, [teamId]: { loading: true } }));
    api
      // The opposing **lineup**, which is this cache's whole subject — the side
      // is not a parameter here because a pitcher's row has no use for the other
      // one.
      .teamSplits(teamId, 'season')
      .then((board) => setOpps((p) => ({ ...p, [teamId]: { board } })))
      .catch(() => {
        asked.current.delete(teamId);
        setOpps((p) => ({ ...p, [teamId]: { error: true } }));
      });
  }, []);
  return { opps, load };
}

/**
 * The dialog body a pressed row draws: the same `OpponentSection` a pitcher's
 * Upcoming row opens in the feed, over the club's season line once it lands.
 *
 * **The same component rather than a thinner one**, which is the whole point —
 * nine cuts, three rows, ten columns, the span and venue controls and the
 * accented hand row are drawn once in the app and read the same wherever a
 * pitcher's opponent is. What these callers supply that the feed's does not is
 * the *season* board itself, there being no `PlayerGame` here to have carried
 * it.
 *
 * The three states before the table are the app's own loading discipline:
 * nothing at all under `WAIT_DELAY` (a club already read comes back in a tick,
 * and a wait that flashes reads as the page breaking), then the block wait, then
 * an error line with the retry the press has to offer — the row behind the
 * dialog being `inert` while it is open, so there is nowhere else to put one.
 */
export function OpponentRead({
  opp,
  opponent,
  opponentId,
  hand,
  onRetry,
}: {
  opp: OppRead | undefined;
  opponent: string;
  opponentId: number;
  /** The hand on the mound, which decides which row of the table is accented.
   *  A game nobody has played has no `stand` to read it off, so a caller
   *  drawing a fixture passes the pitcher's own throwing hand. */
  hand: string | null;
  onRetry: (teamId: number) => void;
}) {
  const board = opp && 'board' in opp ? opp.board : undefined;
  const waiting = useDelayedFlag(board === undefined && !opp?.error);
  if (board) {
    return <OpponentSection hitting={board} opponent={opponent} hand={hand} />;
  }
  if (opp?.error) {
    return (
      <div className="details-error opp-status">
        Couldn&rsquo;t read the opponent&rsquo;s line.{' '}
        <button type="button" className="ovw-link" onClick={() => onRetry(opponentId)}>
          Try again
        </button>
      </div>
    );
  }
  // A board that came back `null` — the server has no row for that club. The row
  // behind this dialog goes static on the same answer, so this is what a reader
  // sees once and never again.
  if (board === null) return <div className="opp-status">No line for {opponent}.</div>;
  return waiting ? <LoadingBlock>Reading the opponent&rsquo;s line</LoadingBlock> : null;
}
