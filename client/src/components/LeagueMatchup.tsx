import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useDelayedFlag } from '../hooks';
import { LoadingBlock } from './Loading';
import LeagueTeam from './LeagueTeam';
import { catScore, categoryGroups, fmtValue, prettyDate, record, TeamLogo } from './LeagueView';
import type {
  EspnCategory,
  EspnMatchup,
  EspnMatchupSide,
  EspnRosterPlayer,
  EspnScoreboard,
  EspnStandingsTeam,
} from '../types';

/**
 * The **Matchup** tab: one matchup read the way a manager reads one, and any
 * matchup in the league rather than only the reader's own.
 *
 * **Why this is a page and not the scoreboard card enlarged.** The Scoreboard
 * answers *how is everybody doing* — ten cards, each a headline and a category
 * line squeezed into five columns a side — and it is read by scanning. This
 * answers *how am I doing against him*, which is read one category at a time,
 * down: is he beating me in saves, by how much, and is it worth chasing. Those
 * are two questions about the same numbers and they want two shapes, which is
 * the same argument that made Rankings its own tab rather than a block under
 * the scoreboard.
 *
 * **So the categories run down the middle and each side's figure is beside its
 * own name**, left and right. That is what makes the comparison a glance rather
 * than an arithmetic: the two numbers a reader is comparing are on one line
 * with the thing they measure between them, where the scoreboard's card puts
 * them in two rows several categories apart and asks the eye to hold a column.
 *
 * **Batters first, then pitchers**, in the same order as the Scoreboard and the
 * Rankings table — `categoryGroups`, which is the one place in the client that
 * splits them and reads the server's own `side`/`order` rather than guessing
 * from a label (`H` is a hit and a hit allowed; see `LeagueView.tsx`).
 */

/** The winner of one category, from the two figures. `outcome`'s twin in
 *  `LeagueView.tsx` and deliberately the same arithmetic: ESPN fills its own
 *  `result` only once a matchup is over, so a live week would say nothing. */
function winnerOf(
  left: number | undefined,
  right: number | undefined,
  cat: EspnCategory,
): 'left' | 'right' | 'tie' | null {
  if (typeof left !== 'number' || typeof right !== 'number') return null;
  if (left === right) return 'tie';
  return (cat.lowerBetter ? left < right : left > right) ? 'left' : 'right';
}

/** How a matchup reads in a picker: "Pirates Cove vs The Homewreckers". */
function matchupLabel(
  m: EspnMatchup,
  teams: Map<number, EspnStandingsTeam>,
): string {
  const name = (id: number) => teams.get(id)?.name ?? `Team ${id}`;
  return m.away ? `${name(m.away.teamId)} vs ${name(m.home.teamId)}` : `${name(m.home.teamId)} — bye`;
}

function SideHead({
  side,
  team,
  score,
  leading,
  align,
}: {
  side: EspnMatchupSide;
  team: EspnStandingsTeam | undefined;
  score: string | null;
  leading: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={`mup-side mup-side-${align}${leading ? ' mup-leading' : ''}`}>
      <TeamLogo team={team} />
      <span className="mup-side-id">
        <span className="mup-side-name">{team?.name ?? `Team ${side.teamId}`}</span>
        {team && <span className="mup-side-rec">{record(team)}</span>}
      </span>
      {score !== null && <span className="mup-side-score">{score}</span>}
    </div>
  );
}

/**
 * Both teams' rosters, side by side.
 *
 * **Behind a toggle rather than always drawn**, and the reason is a request
 * rather than a taste: it is two ESPN reads of ~198KB each, and the categories
 * above are what the tab is for. Read once per matchup and kept — a settled
 * week's roster is a fact and the server holds it on a blob, and a live week's
 * is the ten minutes the ownership map already runs on.
 */
function Rosters({
  away,
  home,
  teams,
  date,
  onOpenPlayer,
}: {
  /** Null on a bye, which has one team and is still worth reading. */
  away: EspnMatchupSide | null;
  home: EspnMatchupSide;
  teams: Map<number, EspnStandingsTeam>;
  date: string;
  onOpenPlayer: (mlbId: number) => void;
}) {
  const [rosters, setRosters] = useState<Record<string, EspnRosterPlayer[] | null> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const waiting = useDelayedFlag(loading);
  const sides = away ? [away, home] : [home];
  const ids = sides.map((s) => s.teamId);
  const key = `${ids.join(',')}:${date}`;

  /**
   * **The dependency array is the whole of the guard, and a ref beside it was
   * a bug.** This effect used to mark the request as asked *before* firing it
   * and bail on a second pass that found the mark — which is fatal under
   * `StrictMode`: React mounts, tears down and re-runs, so pass one set the
   * mark and had its result thrown away by the teardown (`live` false, so
   * neither `setRosters` nor `setLoading(false)` ever ran), and pass two saw
   * the mark and returned. `loading` stayed true for ever and the spinner never
   * resolved. It reproduced only under `npm run dev`, React double-invoking in
   * development builds alone, which is why it survived being driven against the
   * built client.
   *
   * The ref bought nothing the deps do not: `key` is the two team ids and the
   * date, so an unrelated re-render re-runs nothing, and a genuine change is
   * exactly when a re-read is wanted. The double invoke now costs a second
   * request in development and nothing in production — and not even a second
   * ESPN read, `getTeamRoster`'s `inFlight` map deduping the pair server-side.
   *
   * The same mistake, in the same shape, is recorded on the opponent table's
   * own read; the rule to carry away is **never mark a request answered before
   * it is answered**, or unmark it in the cleanup.
   */
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(false);
    setRosters(null);
    api
      .espnRosters(ids, date)
      .then((r) => live && setRosters(r.rosters))
      .catch(() => live && setError(true))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // `ids` is derived from the two team ids `key` already names, so the key is
    // the whole of what this effect depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (waiting) return <LoadingBlock>Reading both rosters</LoadingBlock>;
  if (error) {
    return <div className="mup-note">Couldn&rsquo;t read the rosters — press Rosters again to retry.</div>;
  }
  if (!rosters) return null;

  return (
    <div className="mup-rosters">
      {sides.map((side) => {
        const list = rosters[String(side.teamId)];
        const team = teams.get(side.teamId);
        return (
          <div className="mup-roster" key={side.teamId}>
            <div className="mup-roster-head">
              <TeamLogo team={team} />
              <span className="mup-roster-name">{team?.name ?? `Team ${side.teamId}`}</span>
            </div>
            {!list ? (
              <div className="mup-note">ESPN wouldn&rsquo;t answer for this team.</div>
            ) : (
              <ul className="mup-roster-list">
                {list.map((p) => (
                  <li
                    key={`${p.espnId}-${p.slotId}`}
                    className={`mup-player${p.starting ? '' : ' mup-benched'}`}
                  >
                    {/* The slot leads, as it does on the summary table's own
                        rows: a fantasy roster is scanned by slot. Accent for a
                        lineup spot, muted for the bench and the IL — starting
                        or not is the question, not which slot. */}
                    <span className={`mup-slot${p.starting ? ' mup-slot-on' : ''}`}>{p.slot}</span>
                    {p.mlbId !== null ? (
                      <button
                        type="button"
                        className="mup-player-name"
                        onClick={() => onOpenPlayer(p.mlbId!)}
                      >
                        {p.name}
                      </button>
                    ) : (
                      <span className="mup-player-name mup-player-plain">{p.name}</span>
                    )}
                    {p.injuryStatus && <span className="mup-inj">{p.injuryStatus.replace(/_/g, ' ')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Which of the three pages of a matchup is on screen: one manager's team, the
 * category comparison, or the other manager's.
 *
 * **Summary is the middle one and the default**, which is the whole shape of
 * the strip: a matchup is two teams with a comparison between them, so the
 * comparison sits between them here exactly as each category sits between the
 * two figures it names on the page below. Landing on it is the app's own rule
 * that the tab you open on is the question the page is opened with — *how am I
 * doing against him* — with each side's roster one press either way.
 */
type MatchupSideTab = 'away' | 'summary' | 'home';

export default function LeagueMatchupTab({
  board,
  matchupId,
  onMatchup,
  onPeriod,
  onOpenPlayer,
  onOpenDetails,
}: {
  board: EspnScoreboard;
  matchupId: number | null;
  onMatchup: (id: number) => void;
  onPeriod: (period: number) => void;
  onOpenPlayer: (mlbId: number) => void;
  /** Open a player's page by the app's `${kind}-${id}` key — what the two team
   *  pages' tables and feeds do with a name, and what every other route into
   *  that page uses. The roster list beside them names a player by MLB id
   *  alone and so keeps `onOpenPlayer`; the two are the same page reached from
   *  two shapes of fact. */
  onOpenDetails: (key: string) => void;
}) {
  const [showRosters, setShowRosters] = useState(false);
  /**
   * **The chosen side is stored against the matchup it was chosen for**, so
   * changing matchup or stepping a week lands back on Summary rather than on
   * "away" — which by then names a different manager, and would be the strip
   * silently pointing somewhere else. Derived rather than reset in an effect:
   * an effect would render the old side for a frame first.
   */
  const [sideChoice, setSideChoice] = useState<{ id: number; side: MatchupSideTab } | null>(null);
  const teams = useMemo(() => new Map(board.teams.map((t) => [t.id, t])), [board.teams]);
  const groups = useMemo(() => categoryGroups(board.categories), [board.categories]);

  // Which matchup. A `mup=` naming one this period has no row for — an older
  // link, or the reader stepping back a week — falls back to the reader's own,
  // then to the first, rather than to an empty page: the same direction every
  // parameter in this app fails in.
  const mine = useMemo(
    () =>
      board.myTeamId == null
        ? null
        : (board.matchups.find(
            (m) => m.home.teamId === board.myTeamId || m.away?.teamId === board.myTeamId,
          ) ?? null),
    [board],
  );
  const matchup =
    board.matchups.find((m) => m.id === matchupId) ?? mine ?? board.matchups[0] ?? null;

  const span =
    board.start && board.end
      ? board.start === board.end
        ? prettyDate(board.start)
        : `${prettyDate(board.start)} – ${prettyDate(board.end)}`
      : null;

  const head = (
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
      <span className={`lg-state${board.live ? ' lg-state-live' : ''}`}>
        {board.live ? 'Live' : 'Final'}
      </span>
    </div>
  );

  if (board.format === 'standings' || board.format === 'unknown') {
    return (
      <>
        {head}
        <div className="empty-state">
          <h3>No matchups in this league</h3>
          <p>
            ESPN scores it as <code>{board.scoringType}</code> — there is no matchup to break
            down. The Rankings tab is the league.
          </p>
        </div>
      </>
    );
  }
  if (!matchup) {
    return (
      <>
        {head}
        <div className="empty-state">
          <h3>No matchups in week {board.matchupPeriod}</h3>
          <p>ESPN has no schedule for this period yet.</p>
        </div>
      </>
    );
  }

  const { home, away } = matchup;
  const leading =
    matchup.winner === 'home' ? home.teamId : matchup.winner === 'away' ? away?.teamId : null;
  const score = (side: EspnMatchupSide) =>
    board.format === 'h2h-points'
      ? typeof side.points === 'number'
        ? String(Math.round(side.points * 100) / 100)
        : '—'
      : catScore(side);
  // The roster view reads the **last day of the period**, which for a week
  // still being played is today: a settled week shows the team that finished it
  // and a live one shows the team as it stands. That is the same anchor the
  // summary table's slot chips take, one level up.
  const rosterDate = board.end ?? '';

  /**
   * **The three pages of a matchup**, away on the left and home on the right —
   * the same order the card below puts them in, so the strip and the comparison
   * cannot disagree about which side is which.
   *
   * The team pages are a **week of games**, so they are offered only when the
   * period has days to draw them over: with no anchor to date it by there is no
   * week, and a tab leading to an empty one would be worse than a tab that
   * isn't there. That is the rule the Rankings tab's own span strip follows for
   * a half with no matchup period in it.
   */
  const sides: { tab: MatchupSideTab; label: string; title: string }[] = [];
  const canReadTeams = Boolean(board.start && board.end);
  if (canReadTeams && away) {
    const t = teams.get(away.teamId);
    sides.push({
      tab: 'away',
      label: t?.name ?? `Team ${away.teamId}`,
      title: `${t?.name ?? `Team ${away.teamId}`} — this week's roster and feed`,
    });
  }
  sides.push({ tab: 'summary', label: 'Summary', title: 'The two teams, category by category' });
  if (canReadTeams) {
    const t = teams.get(home.teamId);
    sides.push({
      tab: 'home',
      label: t?.name ?? `Team ${home.teamId}`,
      title: `${t?.name ?? `Team ${home.teamId}`} — this week's roster and feed`,
    });
  }
  const sideTab: MatchupSideTab =
    sideChoice && sideChoice.id === matchup.id && sides.some((s) => s.tab === sideChoice.side)
      ? sideChoice.side
      : 'summary';
  const sideTeamId =
    sideTab === 'away' ? away?.teamId ?? null : sideTab === 'home' ? home.teamId : null;

  return (
    <>
      {head}

      {/* Any matchup in the league, which is what this tab is *for* — the
          Scoreboard's own cards press through to here, and the picker is how
          you get to one you did not press. A native select rather than a row of
          pills: ten pairs of team names is a list, and the app already answers
          "more options than fit a row" with a select in four other places. */}
      <div className="mup-controls">
        <label className="mup-pick">
          <span className="mup-pick-label">Matchup</span>
          <select
            className="date-presets-select mup-select"
            value={matchup.id}
            onChange={(e) => onMatchup(Number(e.target.value))}
          >
            {board.matchups.map((m) => (
              <option key={m.id} value={m.id}>
                {matchupLabel(m, teams)}
                {mine && m.id === mine.id ? ' — yours' : ''}
              </option>
            ))}
          </select>
        </label>
        {/* The side-by-side lineups belong to the comparison rather than to the
            page: on a team tab there is one team on screen and the control
            would offer two. It is the one thing the team pages do *not*
            subsume — they are one manager's week in depth where this is both
            managers' lineups against each other. */}
        {sideTab === 'summary' && (
          <button
            type="button"
            className={`research-toggle mup-roster-btn${showRosters ? ' on' : ''}`}
            aria-pressed={showRosters}
            onClick={() => setShowRosters((v) => !v)}
            title="Both teams' rosters for the last day of this period"
          >
            Rosters
          </button>
        )}
      </div>

      {/* Two teams with the comparison between them, which is the shape of the
          thing being read. Drawn only where there is a second page to reach —
          a bye has one team, and a period with no dates has no week to draw
          either of them over. */}
      {sides.length > 1 && (
        <div className="view-switch mup-sides" role="tablist" aria-label="Matchup">
          {sides.map((s) => (
            <button
              key={s.tab}
              type="button"
              role="tab"
              aria-selected={s.tab === sideTab}
              className={`view-tab${s.tab === sideTab ? ' active' : ''}`}
              title={s.title}
              onClick={() => setSideChoice({ id: matchup.id, side: s.tab })}
            >
              {/* The label is a span of its own so it can ellipsize: a tab is
                  `inline-flex`, and `text-overflow` has no effect on a flex
                  container's anonymous item — measured on the live league, a
                  17-character team name clipped hard at 124px of 137 with no
                  ellipsis to say it had. The span is a block container for its
                  own text and truncates properly. */}
              <span className="mup-side-label">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {sideTeamId !== null && board.start && board.end ? (
        <LeagueTeam
          /* Keyed on the team and the week, so crossing from one manager to the
             other is a fresh page rather than one team's rows under the other's
             name while the read is out. */
          key={`${sideTeamId}:${board.start}:${board.end}`}
          teamId={sideTeamId}
          team={teams.get(sideTeamId)}
          start={board.start}
          end={board.end}
          onOpenDetails={onOpenDetails}
        />
      ) : (
        <>
          {!away ? (
          // A bye is a real shape rather than a failed read — the live league's
          // first playoff round is two matchups and eight of them — so it says so
          // plainly. The roster view still applies: there is one team, and a
          // reader on a bye week has more use for it than for anything else here.
          <div className="mup-card">
            <div className="mup-heads mup-heads-bye">
              <SideHead
                side={home}
                team={teams.get(home.teamId)}
                score={null}
                leading={false}
                align="left"
              />
              <span className="lg-bye-tag">Bye</span>
            </div>
          </div>
        ) : (
          <div className="mup-card">
            <div className="mup-heads">
              <SideHead
                side={away}
                team={teams.get(away.teamId)}
                score={score(away)}
                leading={leading === away.teamId}
                align="left"
              />
              <span className="mup-vs">vs</span>
              <SideHead
                side={home}
                team={teams.get(home.teamId)}
                score={score(home)}
                leading={leading === home.teamId}
                align="right"
              />
            </div>

            {board.format === 'h2h-points' ? (
              <div className="mup-note">
                A points league has one number a side, so there is no category line to break down.
              </div>
            ) : (
              groups.map((g) => (
                <div className="mup-group" key={g.side}>
                  <div className="mup-group-head">{g.label}</div>
                  {g.categories.map((c) => {
                    const l = away.scores[c.statId];
                    const r = home.scores[c.statId];
                    const w = winnerOf(l, r, c);
                    const state = (side: 'left' | 'right') =>
                      w === null ? '' : w === side ? ' mup-win' : w === 'tie' ? ' mup-tie' : ' mup-loss';
                    return (
                      <div className="mup-row" key={c.statId}>
                        <span className={`mup-val mup-val-left${state('left')}`}>
                          {fmtValue(l, c)}
                        </span>
                        {/* The category between the two figures it names, which
                            is the whole shape of this page: the comparison is a
                            glance rather than an arithmetic. */}
                        <span className="mup-cat" title={c.name}>
                          {c.label}
                        </span>
                        <span className={`mup-val mup-val-right${state('right')}`}>
                          {fmtValue(r, c)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}

        {showRosters && rosterDate && (
          <Rosters
            away={away}
            home={home}
            teams={teams}
            date={rosterDate}
            onOpenPlayer={onOpenPlayer}
          />
        )}
        </>
      )}
    </>
  );
}
