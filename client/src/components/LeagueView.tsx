/**
 * The League view — the one page in this app that is about the *fantasy
 * league* rather than about players.
 *
 * Two blocks, in the order the two questions come in:
 *
 *  1. **The scoreboard** — every matchup of the period, both teams named, with
 *     the category line under them and the winning side of each marked. The
 *     reader's own matchup leads, because that is what the page is opened for.
 *  2. **The standings table** — every team in the league against every one of
 *     the league's own scoring categories, sortable per column.
 *
 * **It is honest about the league it is looking at.** ESPN runs four shapes of
 * baseball league and only two of them have matchups at all; the server names
 * which (`EspnScoreboard.format`), and each is drawn as what it is rather than
 * as an empty version of the category grid — see `renderScoreboard` below.
 */
import { useMemo, useState } from 'react';
import type { EspnCategory, EspnMatchup, EspnScoreboard, EspnStandingsTeam } from '../types';
import { LoadingBlock } from './Loading';

/* ---- Formatting ---------------------------------------------------------
 *
 * A category's units are the league's, so the format comes off the category
 * rather than off a guess about the number: `.759` is an OPS and `3.93` is an
 * ERA, and printing either the other way is the difference between a stat and
 * a wrong stat. `count` is deliberately not `toFixed(0)` — a count is an
 * integer already, and rounding one would hide a fractional value the app has
 * no business inventing.
 */
function fmt(value: number | undefined, cat: EspnCategory): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (cat.format === 'avg') {
    const s = value.toFixed(3);
    // The slash-line convention: `.759` rather than `0.759`, and `1.024` keeps
    // its 1 because it is a real digit.
    return s.startsWith('0.') ? s.slice(1) : s;
  }
  if (cat.format === 'rate') return value.toFixed(2);
  return String(Math.round(value * 1000) / 1000);
}

/** `7-7-4`, or `7-7` where the league has no ties to report. */
function record(t: { wins: number; losses: number; ties: number }): string {
  return t.ties > 0 ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`;
}

/**
 * A team's logo, or its abbreviation.
 *
 * ESPN lets a manager upload **any URL** — the live league carries images on
 * `thespun.com` and `pbs.twimg.com` beside ESPN's own CDN — so a dead link is
 * the ordinary case rather than the exceptional one. `onError` swaps to the
 * abbreviation rather than leaving a broken-image glyph, which is the same
 * fallback `TeamMark` makes for an MLB cap that fails to load.
 */
function TeamLogo({ team }: { team: EspnStandingsTeam | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!team) return <span className="lg-logo lg-logo-none" aria-hidden="true" />;
  if (!team.logo || failed) {
    return (
      <span className="lg-logo lg-logo-none" aria-hidden="true">
        {team.abbrev.slice(0, 3)}
      </span>
    );
  }
  return (
    <img
      className="lg-logo"
      src={team.logo}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* ---- The scoreboard ----------------------------------------------------- */

/**
 * Which way a category has gone, for one side.
 *
 * Computed from the two scores rather than read, because ESPN fills its own
 * `result` only once a matchup is **over** — see `espn.ts`, where the same
 * arithmetic is checked against ESPN's answer on 1,080 finished categories. A
 * category one side is ineligible for (absent from `scores`) is `null`: not a
 * win, not a loss, and not drawn as either.
 */
function outcome(
  mine: number | undefined,
  theirs: number | undefined,
  cat: EspnCategory,
): 'win' | 'loss' | 'tie' | null {
  if (typeof mine !== 'number' || typeof theirs !== 'number') return null;
  if (mine === theirs) return 'tie';
  return (cat.lowerBetter ? mine < theirs : mine > theirs) ? 'win' : 'loss';
}

function MatchupCard({
  matchup,
  categories,
  teams,
  myTeamId,
  format,
  live,
}: {
  matchup: EspnMatchup;
  categories: EspnCategory[];
  teams: Map<number, EspnStandingsTeam>;
  myTeamId: number | null;
  format: EspnScoreboard['format'];
  live: boolean;
}) {
  const { home, away } = matchup;
  const mine = myTeamId != null && (home.teamId === myTeamId || away?.teamId === myTeamId);

  // A bye is a real shape rather than a failed read — a 12-team league's first
  // playoff round had two matchups and eight of them — so it says so plainly
  // instead of drawing a grid with one row in it.
  if (!away) {
    return (
      <div className={`lg-matchup lg-bye${mine ? ' lg-mine' : ''}`}>
        {mine && <div className="lg-mine-tag">Your matchup</div>}
        <div className="lg-side">
          <TeamLogo team={teams.get(home.teamId)} />
          <span className="lg-team-name">{teams.get(home.teamId)?.name ?? `Team ${home.teamId}`}</span>
          <span className="lg-bye-tag">Bye</span>
        </div>
      </div>
    );
  }

  /** The headline number beside each name: categories taken in a category
   *  league, the points total in a points one. */
  const score = (side: typeof home) =>
    format === 'h2h-points' ? fmtPoints(side.points) : String(side.wins);

  const leading =
    matchup.winner === 'home' ? home.teamId : matchup.winner === 'away' ? away.teamId : null;

  return (
    <div className={`lg-matchup${mine ? ' lg-mine' : ''}`}>
      {mine && <div className="lg-mine-tag">Your matchup</div>}
      {[away, home].map((side) => {
        const team = teams.get(side.teamId);
        return (
          <div
            key={side.teamId}
            className={`lg-side${leading === side.teamId ? ' lg-leading' : ''}`}
          >
            <TeamLogo team={team} />
            <span className="lg-team-name">{team?.name ?? `Team ${side.teamId}`}</span>
            {team && <span className="lg-team-rec">{record(team)}</span>}
            <span className="lg-side-score">{score(side)}</span>
          </div>
        );
      })}

      {/* A points league has one number a side and no category line to draw;
          saying so is the whole of what its card holds. */}
      {format === 'h2h-categories' && categories.length > 0 && (
        <div className="lg-cats" role="table" aria-label="Category line">
          <div className="lg-cat-row lg-cat-head" role="row">
            {categories.map((c) => (
              <span key={c.statId} role="columnheader" title={c.name}>
                {c.label}
              </span>
            ))}
          </div>
          {[away, home].map((side, i) => {
            const other = i === 0 ? home : away;
            return (
              <div className="lg-cat-row" role="row" key={side.teamId}>
                {categories.map((c) => {
                  const v = side.scores[c.statId];
                  const state = outcome(v, other.scores[c.statId], c);
                  return (
                    <span
                      key={c.statId}
                      role="cell"
                      className={state ? `lg-cat-${state}` : undefined}
                      title={`${c.name}: ${fmt(v, c)}${
                        state === 'win'
                          ? ' — winning'
                          : state === 'loss'
                            ? ' — losing'
                            : state === 'tie'
                              ? ' — tied'
                              : ''
                      }${live ? ' so far' : ''}`}
                    >
                      {fmt(v, c)}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmtPoints(p: number | null): string {
  return typeof p === 'number' && Number.isFinite(p) ? String(Math.round(p * 100) / 100) : '—';
}

/* ---- The standings table ------------------------------------------------
 *
 * Sortable per column, and the mechanics are the research board's own
 * `.research-sort` / `.research-arrow` — folded onto in the stylesheet rather
 * than restated — while the *sort itself* is local and small. That split is
 * deliberate: the board's sort is written against its `Column` vocabulary
 * (`value`, `toValue`, `ascFirst`, forty definitions of a derived rate), and
 * none of that exists here. These columns are discovered at runtime from the
 * league's own `scoringItems`, so there is nothing to reuse but the look of a
 * sorted header — which is exactly what is reused.
 */
type SortKey = { kind: 'name' } | { kind: 'record' } | { kind: 'cat'; statId: number };

function sameKey(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'cat' || b.kind !== 'cat' || a.statId === b.statId;
}

function StandingsTable({
  teams,
  categories,
  myTeamId,
  format,
}: {
  teams: EspnStandingsTeam[];
  categories: EspnCategory[];
  myTeamId: number | null;
  format: EspnScoreboard['format'];
}) {
  // Opens on the league's own standing, which is the order ESPN keeps and the
  // one a reader arrives expecting. `seed` is that order; ascending, so first
  // is first.
  const [sort, setSort] = useState<SortKey>({ kind: 'record' });
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const out = [...teams];
    out.sort((a, b) => {
      let d = 0;
      if (sort.kind === 'name') d = a.name.localeCompare(b.name);
      else if (sort.kind === 'record') d = (a.seed || 99) - (b.seed || 99);
      else {
        const av = a.values[sort.statId];
        const bv = b.values[sort.statId];
        // Nulls to the bottom in **both** directions, the board's own rule: a
        // team with no figure has not got a bad one.
        const an = typeof av !== 'number';
        const bn = typeof bv !== 'number';
        if (an && bn) d = 0;
        else if (an) return 1;
        else if (bn) return -1;
        else d = (av as number) - (bv as number);
      }
      return asc ? d : -d;
    });
    return out;
  }, [teams, sort, asc]);

  const toggle = (key: SortKey, opensAsc: boolean) => {
    if (sameKey(key, sort)) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(opensAsc);
    }
  };

  const head = (key: SortKey, label: string, title: string, opensAsc: boolean, cls = '') => {
    const active = sameKey(key, sort);
    return (
      <th
        scope="col"
        className={`${cls} research-sort${active ? ' active' : ''}`}
        aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" onClick={() => toggle(key, opensAsc)} title={title}>
          <span className="research-arrow" aria-hidden="true">
            {active ? (asc ? '▲' : '▼') : ''}
          </span>
          {label}
        </button>
      </th>
    );
  };

  return (
    <div className="league-scroll">
      <table className="glog-table league-table">
        <thead>
          <tr>
            {head({ kind: 'record' }, 'Team', 'The league standing', true, 'lg-team-col')}
            {categories.map((c) =>
              head(
                { kind: 'cat', statId: c.statId },
                c.label,
                // The direction is stated because it is the one thing a bare
                // abbreviation cannot say, and it differs per category.
                `${c.name} — season to date${c.lowerBetter ? ', lower is better' : ''}`,
                c.lowerBetter,
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={t.id === myTeamId ? 'lg-row-mine' : undefined}>
              <th scope="row" className="lg-team-col glog-date">
                <TeamLogo team={t} />
                <span className="lg-row-name">
                  {t.name}
                  <span className="lg-row-sub">
                    {record(t)}
                    {t.streak ? ` · ${t.streak}` : ''}
                    {format === 'h2h-points' ? ` · ${fmtPoints(t.points)} pts` : ''}
                  </span>
                </span>
              </th>
              {categories.map((c) => (
                <td key={c.statId} className="glog-num">
                  {fmt(t.values[c.statId], c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- The view ----------------------------------------------------------- */

function prettyDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function LeagueView({
  board,
  loading,
  error,
  onPeriod,
  connected,
  onConnect,
}: {
  board: EspnScoreboard | null;
  loading: boolean;
  error: string | null;
  onPeriod: (period: number) => void;
  connected: boolean;
  onConnect: () => void;
}) {
  const teamMap = useMemo(
    () => new Map((board?.teams ?? []).map((t) => [t.id, t])),
    [board],
  );

  // The reader's own matchup leads. That is what this page is opened for, and
  // it is a *sort* rather than a mark on its own — the accent border says which
  // one it is, and putting it first means it is on screen without scrolling on
  // a phone, which no amount of marking achieves.
  const matchups = useMemo(() => {
    const list = [...(board?.matchups ?? [])];
    const me = board?.myTeamId;
    if (me == null) return list;
    return list.sort((a, b) => {
      const am = a.home.teamId === me || a.away?.teamId === me ? 0 : 1;
      const bm = b.home.teamId === me || b.away?.teamId === me ? 0 : 1;
      return am - bm;
    });
  }, [board]);

  // Every empty state names its own cause, which for this view means naming
  // the *league format* rather than saying there is nothing here: a roto league
  // has no matchups by design and one whose scoring ESPN spells in a word this
  // app has never seen is a refusal rather than a failure.
  if (!connected) {
    return (
      <div className="empty-state">
        <h3>No fantasy league connected</h3>
        <p>
          The League page reads your ESPN league's matchups and standings, so it needs one
          connected.
        </p>
        <div className="empty-actions">
          <button type="button" className="empty-help" onClick={onConnect}>
            Connect a league
          </button>
        </div>
      </div>
    );
  }

  if (error && !board) {
    return (
      <div className="empty-state">
        <h3>Couldn't read your league</h3>
        <p>{error}</p>
      </div>
    );
  }

  // Never over data: a re-read leaves what is on screen standing, and the block
  // wait is only for a pane with nothing in it yet.
  if (!board) {
    return loading ? <LoadingBlock>Reading your league's scoreboard</LoadingBlock> : null;
  }

  const span =
    board.start && board.end
      ? board.start === board.end
        ? prettyDate(board.start)
        : `${prettyDate(board.start)} – ${prettyDate(board.end)}`
      : null;

  return (
    <div className="league-view">
      <div className="lg-head">
        <div className="lg-period">
          <button
            type="button"
            className="lg-nav"
            disabled={board.prevPeriod == null}
            onClick={() => board.prevPeriod != null && onPeriod(board.prevPeriod)}
            aria-label="Previous matchup period"
            title="Previous matchup period"
          >
            ‹
          </button>
          <span className="lg-period-label">
            <span className="lg-period-n">Week {board.matchupPeriod}</span>
            {span && <span className="lg-period-dates">{span}</span>}
          </span>
          <button
            type="button"
            className="lg-nav"
            disabled={board.nextPeriod == null}
            onClick={() => board.nextPeriod != null && onPeriod(board.nextPeriod)}
            aria-label="Next matchup period"
            title="Next matchup period"
          >
            ›
          </button>
        </div>
        {/* Live or Final, and the distinction is the whole reason the dates are
            printed: a live period's totals cover the days played *so far*, so
            the two have to be read together. */}
        <span className={`lg-state${board.live ? ' lg-state-live' : ''}`}>
          {board.live ? 'Live' : 'Final'}
        </span>
      </div>

      {board.format === 'unknown' ? (
        <div className="empty-state">
          <h3>This league's scoring isn't supported yet</h3>
          <p>
            ESPN reports it as <code>{board.scoringType}</code>, which this page has never been
            read against — so it shows the season table below rather than guessing at a
            scoreboard shape the league may not have.
          </p>
        </div>
      ) : board.format === 'standings' ? (
        <div className="empty-state">
          <h3>No matchups in this league</h3>
          <p>
            ESPN scores it as <code>{board.scoringType}</code> — a season-long league rather than
            head to head, so there is nothing to draw a scoreboard from. The table below is the
            league.
          </p>
        </div>
      ) : matchups.length === 0 ? (
        <div className="empty-state">
          <h3>No matchups in week {board.matchupPeriod}</h3>
          <p>ESPN has no schedule for this period yet.</p>
        </div>
      ) : (
        <div className="lg-board">
          {matchups.map((m) => (
            <MatchupCard
              key={m.id}
              matchup={m}
              categories={board.categories}
              teams={teamMap}
              myTeamId={board.myTeamId}
              format={board.format}
              live={board.live}
            />
          ))}
        </div>
      )}

      <h3 className="lg-section">Season totals</h3>
      {board.teams.length === 0 ? (
        <div className="empty-state">
          <h3>No teams in this league</h3>
          <p>ESPN returned no teams, which usually means the league id is for another season.</p>
        </div>
      ) : (
        <StandingsTable
          teams={board.teams}
          categories={board.categories}
          myTeamId={board.myTeamId}
          format={board.format}
        />
      )}
    </div>
  );
}
