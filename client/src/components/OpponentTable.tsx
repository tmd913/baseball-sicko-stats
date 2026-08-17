import { useEffect, useState } from 'react';
import { api } from '../api';
import { useDelayedFlag } from '../hooks';
import { ordinal } from '../lib';
import { CardSection } from './PitcherCard';
import { LoadingBlock } from './Loading';
import { TEAM_HITTING_WINDOWS } from '../types';
import type {
  PlayerGame,
  TeamHitting,
  TeamHittingLine,
  TeamHittingVenue,
  TeamHittingWindow,
} from '../types';

/**
 * Who a watched pitcher is up against — the opposing lineup's batting line,
 * whole and by the hand on the mound, over a span the reader picks and cut to
 * home games, road games or both.
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
 * it is 28th. **1st is always the best offence**, so the fewest strikeouts
 * ranks 1st rather than 30th, and every cut ranks within **its own**
 * population — a 30-day home line against the other 29 teams' 30-day home
 * lines, never against the season board.
 */

/** The rows, in the order the reader asked for them: everyone, then the hand
 *  on the mound. */
const ROWS: { key: 'all' | 'vsRight' | 'vsLeft'; label: string; hand: 'L' | 'R' | null }[] = [
  { key: 'all', label: 'Overall', hand: null },
  { key: 'vsRight', label: 'vs RHP', hand: 'R' },
  { key: 'vsLeft', label: 'vs LHP', hand: 'L' },
];

const VENUES: { key: TeamHittingVenue; label: string; title: string }[] = [
  { key: 'all', label: 'All Games', title: 'Every game' },
  { key: 'home', label: 'Home', title: 'Their home games only' },
  { key: 'away', label: 'Away', title: 'Their road games only' },
];

const WINDOW_LABEL: Record<string, string> = {
  season: 'Season', 7: '7d', 15: '15d', 30: '30d', 60: '60d',
};

/** The columns. `rank` names the entry in `TeamHittingRanks` the cell's badge
 *  reads, and the four that have none are counts a rank would say nothing
 *  about — games played, and the plate appearances behind the rates. */
const COLUMNS: {
  key: string;
  label: string;
  title: string;
  of: (l: TeamHittingLine) => string;
  rank?: keyof NonNullable<TeamHittingLine['ranks']>;
}[] = [
  { key: 'g', label: 'G', title: 'Games in this cut', of: (l) => String(l.games) },
  { key: 'pa', label: 'PA', title: 'Plate appearances in this cut', of: (l) => String(l.pa) },
  {
    key: 'rg', label: 'R/G',
    title: 'Runs per game — on a hand row, runs scored off that hand over the games they faced one',
    of: (l) => l.runsPerGame ?? '—', rank: 'runsPerGame',
  },
  { key: 'avg', label: 'AVG', title: 'Batting average', of: (l) => l.avg, rank: 'avg' },
  { key: 'obp', label: 'OBP', title: 'On-base percentage', of: (l) => l.obp, rank: 'obp' },
  { key: 'slg', label: 'SLG', title: 'Slugging', of: (l) => l.slg, rank: 'slg' },
  { key: 'ops', label: 'OPS', title: 'On-base plus slugging', of: (l) => l.ops, rank: 'ops' },
  { key: 'hr', label: 'HR', title: 'Home runs', of: (l) => String(l.homeRuns), rank: 'homeRuns' },
  {
    key: 'k', label: 'K%',
    title: 'Strikeout rate — 1st is the fewest, this being a ranking of offences',
    of: (l) => pct(l.kRate), rank: 'kRate',
  },
  { key: 'bb', label: 'BB%', title: 'Walk rate', of: (l) => pct(l.bbRate), rank: 'bbRate' },
];

/** A stored `.231` share as the percent this table prints — `lib.ts`'s own rule
 *  for the two server lines that carry a share as a rate string. */
function pct(rate: string): string {
  const n = Number(rate);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—';
}

function OpponentBody({
  game,
  throws: reportThrows,
}: {
  game: PlayerGame;
  throws?: string | null;
}) {
  const season = game.opponentHitting;
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
  useEffect(() => {
    if (teamId === null || window === 'season') return;
    const w = String(window);
    if (boards[w]) return;
    let live = true;
    setLoading(true);
    setError(null);
    api
      .teamHitting(teamId, window)
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
  }, [teamId, window, attempt, boards]);

  if (!season) return null;

  // `stand` on a pitcher's game is his throwing hand, and a team's split is by
  // the hand they faced — so the row matching it is the one that is his
  // problem. Before he has thrown a pitch the game has no `stand`, which is
  // exactly when this table is most worth reading, so his report's hand stands
  // in.
  const hand = game.stand ?? reportThrows ?? null;
  const mine = hand === 'L' || hand === 'R' ? hand : null;

  const board = window === 'season' ? season : boards[String(window)];
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
          <LoadingBlock>Reading the opponent&rsquo;s line</LoadingBlock>
        ) : error ? (
          <div className="details-error opp-status">
            Couldn&rsquo;t read the opponent&rsquo;s line — press the span again to retry.
          </div>
        ) : loading ? null : (
          <div className="opp-status">Nobody batted in this span.</div>
        )
      ) : (
        <div className="opp-scroll">
          <table className="opp-table">
            <thead>
              <tr>
                <th className="glog-date opp-rowhead">{game.opponent}</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="glog-num" title={c.title}>
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
                          ? `${game.opponent} against ${row.hand === 'L' ? 'left' : 'right'}-handers — the half that applies to this game`
                          : undefined
                      }
                    >
                      {row.label}
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
  game,
  throws,
  collapsible = false,
  defaultOpen = false,
  bare = false,
}: {
  game: PlayerGame;
  throws?: string | null;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** No heading at all — for the outing page, whose tab strip has already said
   *  `Opponent`. See `CardSection`, where the three modes are argued. */
  bare?: boolean;
}) {
  if (!game.opponentHitting) return null;
  const body = <OpponentBody game={game} throws={throws} />;
  if (bare) return <div className="card-section">{body}</div>;
  return collapsible ? (
    <CardSection title="Opponent" defaultOpen={defaultOpen}>
      {body}
    </CardSection>
  ) : (
    <div className="card-section">
      <div className="section-title opp-title">Opponent</div>
      {body}
    </div>
  );
}
