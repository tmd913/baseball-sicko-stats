/**
 * The League view — the one page in this app that is about the *fantasy
 * league* rather than about players.
 *
 * **Three tabs, because they are three questions.** The page was a scoreboard
 * with a season table stacked under it, which is the shape a page takes when it
 * has one question and a half; it has three now and each is a page of its own:
 *
 *  1. **Scoreboard** — every matchup of one period, the category line under
 *     both sides and the winning half of each marked. *Am I winning.*
 *  2. **Rankings** — every team's figure in every category and where that
 *     figure stands, over a span the reader picks. *Why.*
 *  3. **Transactions** — who added, dropped and traded whom. *What has been
 *     going on.*
 *
 * **The period arrows live inside the Scoreboard tab rather than above the
 * strip**, and that is a decision rather than a placement. A control above the
 * tabs is a control over the page, and this one governs exactly one third of
 * it: the Rankings tab has a span filter of its own — which is a *different*
 * question, four named cuts rather than a week at a time — and Transactions is
 * a feed with no period on it at all. Left above the strip, `‹ Week 19 ›` would
 * have sat over two tabs it says nothing about, and a reader pressing it on the
 * Transactions tab would have watched nothing happen. The app's own precedent
 * is the date control, which sits with the roster tabs it qualifies and is
 * hidden on the research board it does not.
 *
 * **Which tab is open is in the URL** (`lt=`), because it decides what data is
 * on screen — the rule `view=`, `win=` and `mp=` all follow. The Scoreboard is
 * the default and is omitted, so a bare `?view=league` opens where the page
 * always opened.
 *
 * **Each tab's data is read on its first open and kept**, the way the player
 * page's tabs are: nobody who never opens Transactions pays for a 250-row
 * activity feed. See `docs/claude/client-league.md`.
 */
import { useMemo, useState } from 'react';
import type {
  EspnCategory,
  EspnMatchup,
  EspnRankSpan,
  EspnRankings,
  EspnScoreboard,
  EspnStandingsTeam,
  EspnTransactions,
} from '../types';
import { LoadingBlock } from './Loading';
import LeagueRankings from './LeagueRankings';
import LeagueTransactions from './LeagueTransactions';

/* ---- Formatting ---------------------------------------------------------
 *
 * A category's units are the league's, so the format comes off the category
 * rather than off a guess about the number: `.759` is an OPS and `3.93` is an
 * ERA, and printing either the other way is the difference between a stat and
 * a wrong stat. `count` is deliberately not `toFixed(0)` — a count is an
 * integer already, and rounding one would hide a fractional value the app has
 * no business inventing.
 */
export function fmtValue(value: number | undefined, cat: EspnCategory): string {
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
export function record(t: { wins: number; losses: number; ties: number }): string {
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
export function TeamLogo({ team }: { team: EspnStandingsTeam | undefined }) {
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
                      title={`${c.name}: ${fmtValue(v, c)}${
                        state === 'win'
                          ? ' — winning'
                          : state === 'loss'
                            ? ' — losing'
                            : state === 'tie'
                              ? ' — tied'
                              : ''
                      }${live ? ' so far' : ''}`}
                    >
                      {fmtValue(v, c)}
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

/* ---- The view ----------------------------------------------------------- */

export function prettyDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The Scoreboard tab: the period header, its arrows, and the matchup cards.
 *
 * Split out of the view proper when the view gained tabs, so that "which
 * period" and "which matchups" stay one component — they are one question and
 * the arrows are the only control over it.
 */
function Scoreboard({
  board,
  onPeriod,
}: {
  board: EspnScoreboard;
  onPeriod: (period: number) => void;
}) {
  const teamMap = useMemo(() => new Map(board.teams.map((t) => [t.id, t])), [board.teams]);

  // The reader's own matchup leads. That is what this page is opened for, and
  // it is a *sort* rather than a mark on its own — the accent border says which
  // one it is, and putting it first means it is on screen without scrolling on
  // a phone, which no amount of marking achieves.
  const matchups = useMemo(() => {
    const list = [...board.matchups];
    const me = board.myTeamId;
    if (me == null) return list;
    return list.sort((a, b) => {
      const am = a.home.teamId === me || a.away?.teamId === me ? 0 : 1;
      const bm = b.home.teamId === me || b.away?.teamId === me ? 0 : 1;
      return am - bm;
    });
  }, [board]);

  const span =
    board.start && board.end
      ? board.start === board.end
        ? prettyDate(board.start)
        : `${prettyDate(board.start)} – ${prettyDate(board.end)}`
      : null;

  return (
    <>
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
            read against — so it shows nothing here rather than guessing at a scoreboard shape
            the league may not have. The Rankings tab still draws the league's own totals.
          </p>
        </div>
      ) : board.format === 'standings' ? (
        <div className="empty-state">
          <h3>No matchups in this league</h3>
          <p>
            ESPN scores it as <code>{board.scoringType}</code> — a season-long league rather than
            head to head, so there is nothing to draw a scoreboard from. The Rankings tab is the
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
    </>
  );
}

/** Which of the three pages of this view is on screen. */
export type LeagueTab = 'scoreboard' | 'rankings' | 'transactions';

const TABS: { tab: LeagueTab; label: string; title: string }[] = [
  { tab: 'scoreboard', label: 'Scoreboard', title: "This period's matchups" },
  { tab: 'rankings', label: 'Rankings', title: 'Where every team stands in each category' },
  { tab: 'transactions', label: 'Transactions', title: 'Who has added, dropped and traded whom' },
];

export default function LeagueView({
  tab,
  onTab,
  board,
  loading,
  error,
  onPeriod,
  rankings,
  rankSpan,
  rankingsLoading,
  rankingsError,
  onRankSpan,
  transactions,
  transactionsLoading,
  transactionsError,
  onOpenPlayer,
  connected,
  onConnect,
}: {
  tab: LeagueTab;
  onTab: (tab: LeagueTab) => void;
  board: EspnScoreboard | null;
  loading: boolean;
  error: string | null;
  onPeriod: (period: number) => void;
  rankings: EspnRankings | null;
  rankSpan: EspnRankSpan;
  rankingsLoading: boolean;
  rankingsError: string | null;
  onRankSpan: (span: EspnRankSpan) => void;
  transactions: EspnTransactions | null;
  transactionsLoading: boolean;
  transactionsError: string | null;
  onOpenPlayer: (mlbId: number) => void;
  connected: boolean;
  onConnect: () => void;
}) {
  // Every empty state names its own cause. This one is the view's rather than a
  // tab's: with no league connected there is nothing for any of the three to
  // read, so the strip is not drawn at all — three tabs over one message would
  // be chrome for a feature the reader hasn't got.
  if (!connected) {
    return (
      <div className="empty-state">
        <h3>No fantasy league connected</h3>
        <p>
          The League page reads your ESPN league's matchups, rankings and transactions, so it
          needs one connected.
        </p>
        <div className="empty-actions">
          <button type="button" className="empty-help" onClick={onConnect}>
            Connect a league
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="league-view">
      {/* The strip. Folded onto `.view-switch` / `.view-tab` in the stylesheet
          rather than restyled to resemble the app's other tab rows, so this is
          the same object as the view switch above it by construction. */}
      <div className="lg-tabs" role="tablist" aria-label="League">
        {TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            role="tab"
            aria-selected={t.tab === tab}
            className={`lg-tab${t.tab === tab ? ' active' : ''}`}
            onClick={() => onTab(t.tab)}
            title={t.title}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rankings' ? (
        <LeagueRankings
          rankings={rankings}
          span={rankSpan}
          loading={rankingsLoading}
          error={rankingsError}
          onSpan={onRankSpan}
        />
      ) : tab === 'transactions' ? (
        <LeagueTransactions
          data={transactions}
          loading={transactionsLoading}
          error={transactionsError}
          onOpenPlayer={onOpenPlayer}
        />
      ) : error && !board ? (
        <div className="empty-state">
          <h3>Couldn't read your league</h3>
          <p>{error}</p>
        </div>
      ) : !board ? (
        // Never over data: a re-read leaves what is on screen standing, and the
        // block wait is only for a pane with nothing in it yet.
        loading ? (
          <LoadingBlock>Reading your league's scoreboard</LoadingBlock>
        ) : null
      ) : (
        <Scoreboard board={board} onPeriod={onPeriod} />
      )}
    </div>
  );
}
