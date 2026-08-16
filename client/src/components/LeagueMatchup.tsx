import { useEffect, useMemo, useRef, useState } from 'react';
import { answersEscape, useLockBodyScroll, useOverlayFocus } from '../hooks';
import { DialogLayerContext } from './Modal';
import { DateRow, DateToggle } from './DateControls';
import type { DatePreset } from './DateControls';
import LeagueTeam from './LeagueTeam';
import { ScheduleSpanTabs, ScheduleToggle } from './ScheduleControl';
import { buildScheduleIndex } from './schedule';
import type { ScheduleSpan } from './schedule';
import { catScore, categoryGroups, fmtValue, prettyDate, record, TeamLogo } from './LeagueView';
import type {
  EspnCategory,
  EspnMatchupSide,
  EspnScoreboard,
  EspnStandingsTeam,
  PlayerKind,
  ScheduleWindow,
} from '../types';

/**
 * One matchup, as a **full-screen page over the League view** rather than a tab
 * inside it.
 *
 * **Why it left the tab row.** It was the League view's first tab, and it did
 * not belong there: the other three — Scoreboard, Rankings, Transactions — are
 * three readings of *the league*, where this is one row of the first of them
 * opened up. A tab row is a set of siblings, and one of the four was a
 * different depth from the other three; it also meant the strip carried a page
 * whose subject the strip could not name (which matchup?), and answered it with
 * a dropdown of ten pairs of team names sitting above the thing it selected.
 *
 * As a page opened *from* a scoreboard card, all of that goes: **the card is
 * what names the matchup**, the way a row of the research board names the
 * player its page opens on, and the way back is a Back button rather than a
 * control that has to be found again. It is the shape `PlayerDetails` has, and
 * it takes that shape's whole vocabulary — a fixed box with its own scroller,
 * the body pinned behind it, the background `inert`, focus in on open and back
 * out on close, and Escape undoing exactly one thing.
 *
 * **No week selector and no matchup picker.** Both were controls over *which
 * matchup*, which is a question this page no longer asks: it is opened on one,
 * from the board that lists them all. The week is printed rather than
 * navigable, because the numbers on the page are meaningless without it and
 * because a live week's totals cover the days played so far — the arrows are
 * back on the Scoreboard, which is the page about which week.
 *
 * **Three pages inside it**: the away team, the comparison, the home team —
 * two teams with the comparison between them, which is the shape of the thing
 * being read and is the same arrangement each category has on the card below.
 * Summary is the middle one and the default.
 */

/**
 * The layer this overlay paints on.
 *
 * **Below the player page (50), above the full-page table box (45)** — which is
 * what makes the stack behave without a single special case: a player page
 * opened from a team page's table sits over this one and answers Escape first,
 * and a dialog opened *inside* here (a feed item's at-bat card) takes 49 from
 * the context below, which is above this box and below that page. The how-to
 * and league-settings overlays keep their 60 and cover everything.
 */
const MATCHUP_LAYER = 48;

/** Which of the three pages of a matchup is on screen. */
type MatchupSideTab = 'away' | 'summary' | 'home';

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

export default function LeagueMatchupView({
  board,
  matchupId,
  onClose,
  onOpenDetails,
  presets,
  maxDate,
  today,
  scheduleWindow,
  scheduleLoading,
  onNeedSchedule,
}: {
  board: EspnScoreboard;
  matchupId: number;
  onClose: () => void;
  onOpenDetails: (key: string) => void;
  /** The app's own named spans, handed down rather than rebuilt here — one
   *  definition of what `Today` means, and the matchup's own span is added to
   *  them below. */
  presets: DatePreset[];
  maxDate: string;
  today: string;
  /** Every club's next fortnight, read once per session by App and shared: the
   *  Schedule view's own data takes no parameters, so a second read here would
   *  buy a wait and nothing else. Null until somebody asks for it. */
  scheduleWindow: ScheduleWindow | null;
  scheduleLoading: boolean;
  onNeedSchedule: () => void;
}) {
  useLockBodyScroll();
  const viewRef = useRef<HTMLDivElement | null>(null);
  useOverlayFocus(viewRef);

  const [sideTab, setSideTab] = useState<MatchupSideTab>('summary');
  const [reading, setReading] = useState<'roster' | 'feed'>('roster');
  const [kind, setKind] = useState<PlayerKind>('batter');
  const [dateOpen, setDateOpen] = useState(false);
  const [scheduleSpan, setScheduleSpan] = useState<ScheduleSpan | null>(null);
  /**
   * **The days a team page reports on, and they start at today** rather than at
   * the matchup's week.
   *
   * That is the reading a manager arrives with — *what is his team doing right
   * now* — and it is what the app's own roster views open on, which is the
   * whole point of these pages being those views. The week is one press away as
   * a preset of its own (below), and picking it makes every row the arithmetic
   * behind a category on the Summary page.
   */
  const [span, setSpan] = useState<{ start: string; end: string; preset: string | null }>({
    start: today,
    end: today,
    preset: 'Today',
  });

  /**
   * The app's presets plus **this matchup's own span**, which is the one named
   * range that means something only here: `Matchup` is the days the categories
   * next door were summed over — for a week still being played, the days played
   * so far, so the two agree rather than the table quietly including a day the
   * score does not.
   *
   * It leads, being the reason a reader is on this page at all, and it is
   * absent where the period has no dates to name — an anchor the schedule could
   * not be read for, where offering a span with no days in it would be worse
   * than not offering it.
   */
  const spanPresets = useMemo<DatePreset[]>(
    () =>
      board.start && board.end
        ? [{ label: 'Matchup', start: board.start, end: board.end }, ...presets]
        : presets,
    [board.start, board.end, presets],
  );

  const teams = useMemo(() => new Map(board.teams.map((t) => [t.id, t])), [board.teams]);
  const groups = useMemo(() => categoryGroups(board.categories), [board.categories]);
  const matchup = board.matchups.find((m) => m.id === matchupId) ?? null;

  // The Schedule view's index, or null while the mode is off or its one read is
  // still out — "the mode is the presence of an index rather than a flag beside
  // one", which is what makes "on but still reading" impossible to draw.
  const scheduleIndex = useMemo(
    () =>
      scheduleSpan !== null && scheduleWindow
        ? buildScheduleIndex(scheduleWindow, scheduleSpan)
        : null,
    [scheduleSpan, scheduleWindow],
  );

  /**
   * Escape closes this page — **once**, and only when nothing is stacked above
   * it. `answersEscape` marks the press so a ladder unwinds one rung per key,
   * and the subtree test in front of it is `PlayerDetails`' own: a full-page
   * table box lives *inside* this overlay and answers for itself.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (viewRef.current?.querySelector('.is-expanded')) return;
      if (!answersEscape(e, viewRef.current)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Turning the Schedule view on is what asks App for the fortnight; it is one
  // read per session, shared with the roster views' own copy of this mode.
  useEffect(() => {
    if (scheduleSpan !== null) onNeedSchedule();
  }, [scheduleSpan, onNeedSchedule]);

  // Crossing between the three pages puts this one back at the top: a page is a
  // different reading of the matchup, not a place in one — the rule the player
  // page's own tabs follow.
  useEffect(() => {
    viewRef.current?.scrollTo({ top: 0 });
  }, [sideTab, reading]);

  const period = (
    <span className="mup-week">
      <span className="mup-week-n">Week {board.matchupPeriod}</span>
      {board.start && board.end && (
        <span className="mup-week-dates">
          {board.start === board.end
            ? prettyDate(board.start)
            : `${prettyDate(board.start)} – ${prettyDate(board.end)}`}
        </span>
      )}
      <span className={`lg-state${board.live ? ' lg-state-live' : ''}`}>
        {board.live ? 'Live' : 'Final'}
      </span>
    </span>
  );

  const head = (
    <div className="mup-chrome">
      <div className="mup-bar">
        {/* The way back, and the only one this page needs: it was opened from a
            card on the Scoreboard and returns to it. `.details-back`'s own
            shape, so the two overlays leave by the same door. */}
        <button type="button" className="details-back" onClick={onClose}>
          ‹ Back
        </button>
        {/* Printed rather than navigable. The arrows are the Scoreboard's,
            which is the page about *which* week; here the week is context the
            numbers cannot be read without — a live period's totals cover the
            days played so far, which is why the dates and the state are
            together. */}
        {period}
      </div>
    </div>
  );

  if (!matchup) {
    return (
      <DialogLayerContext.Provider value={MATCHUP_LAYER}>
        <div ref={viewRef} tabIndex={-1} className="mup-view">
          {head}
          <div className="empty-state">
            <h3>That matchup isn&rsquo;t in week {board.matchupPeriod}</h3>
            <p>
              ESPN has no row for it — the link may be for another week. Go back and pick one off
              the scoreboard.
            </p>
          </div>
        </div>
      </DialogLayerContext.Provider>
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

  /**
   * **The three pages**, away on the left and home on the right — the same
   * order the card below puts them in, so the strip and the comparison cannot
   * disagree about which side is which. A bye has one team and so two pages.
   */
  const sides: { tab: MatchupSideTab; label: string; title: string }[] = [];
  const teamTitle = (id: number) =>
    `${teams.get(id)?.name ?? `Team ${id}`} — his roster and his feed`;
  if (away) {
    sides.push({
      tab: 'away',
      label: teams.get(away.teamId)?.name ?? `Team ${away.teamId}`,
      title: teamTitle(away.teamId),
    });
  }
  sides.push({ tab: 'summary', label: 'Summary', title: 'The two teams, category by category' });
  sides.push({
    tab: 'home',
    label: teams.get(home.teamId)?.name ?? `Team ${home.teamId}`,
    title: teamTitle(home.teamId),
  });
  const active = sides.some((s) => s.tab === sideTab) ? sideTab : 'summary';
  const sideTeamId = active === 'away' ? away?.teamId ?? null : active === 'home' ? home.teamId : null;

  /**
   * A team page's own controls — **the roster views' controls, because a team
   * page is those views**. Which reading, which kind, the Schedule view and its
   * span, and the dates: the same set, drawn from the same components, so a
   * reader who knows the Roster page knows this one.
   *
   * They sit on the page rather than in the pinned head, which holds the way
   * back and the week alone: this row belongs to two of the three pages and
   * would be an empty band on the third.
   */
  const tools = (
    <div className={`mup-tools${dateOpen ? ' date-open' : ''}`}>
      <div className="view-switch mup-reading" role="tablist" aria-label="Roster or feed">
        {(['roster', 'feed'] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={reading === r}
            className={`view-tab${reading === r ? ' active' : ''}`}
            onClick={() => setReading(r)}
          >
            {r === 'roster' ? 'Roster' : 'Feed'}
          </button>
        ))}
      </div>
      <div className="kind-switch" role="tablist" aria-label="Batters or pitchers">
        {(['batter', 'pitcher'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            className={`kind-tab${kind === k ? ' active' : ''}`}
            onClick={() => setKind(k)}
          >
            {k === 'batter' ? 'Batters' : 'Pitchers'}
          </button>
        ))}
      </div>
      {/* **The two icon buttons travel as a pair**, which is `.view-bar-tabs`'
          own rule one page down: a group breaks to the next line whole rather
          than one member of it going alone. Measured at 390, the four groups
          come to 382 against the 358 this box has, so the row wraps — and left
          loose it wrapped the *date* button by itself, a lone 36px square under
          two full-width switches with its range bubble hanging over nothing.
          Paired, the second line is the two icons together. */}
      <div className="mup-tool-icons">
        {/* The Schedule view, on the roster table alone — it swaps that table's
            stat columns for a column per day, and there is nothing in a stream
            of things that have happened for a fixture list to replace. */}
        {reading === 'roster' && (
          <ScheduleToggle
            on={scheduleSpan !== null}
            loading={scheduleLoading}
            onToggle={() => setScheduleSpan((s) => (s === null ? 7 : null))}
          />
        )}
        <DateToggle
          open={dateOpen}
          onToggle={() => setDateOpen((v) => !v)}
          start={span.start}
          end={span.end}
          activePreset={span.preset}
        />
      </div>
      {/* Its own group, so a span strip that only exists while the mode is on
          cannot push the pair above it about. */}
      {reading === 'roster' && scheduleSpan !== null && (
        <ScheduleSpanTabs span={scheduleSpan} onChange={setScheduleSpan} />
      )}
      {dateOpen && (
        <DateRow
          presets={spanPresets}
          activePreset={span.preset}
          start={span.start}
          end={span.end}
          max={maxDate}
          onPick={(p) => {
            setSpan({ start: p.start, end: p.end, preset: p.label });
            setDateOpen(false);
          }}
          onRange={(s, e) => setSpan({ start: s, end: e, preset: null })}
        />
      )}
    </div>
  );

  return (
    <DialogLayerContext.Provider value={MATCHUP_LAYER}>
      <div ref={viewRef} tabIndex={-1} className="mup-view">
        {head}

        {sides.length > 1 && (
          <div className="view-switch mup-sides" role="tablist" aria-label="Matchup">
            {sides.map((s) => (
              <button
                key={s.tab}
                type="button"
                role="tab"
                aria-selected={s.tab === active}
                className={`view-tab${s.tab === active ? ' active' : ''}${
                  s.tab === 'summary' ? '' : ' mup-side-team'
                }`}
                title={s.title}
                onClick={() => setSideTab(s.tab)}
              >
                {/* The label is a span of its own so it can ellipsize: a tab is
                    `inline-flex`, and `text-overflow` has no effect on a flex
                    container's anonymous item — a 17-character team name
                    clipped mid-letter with no ellipsis to say it had. */}
                <span className="mup-side-label">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {sideTeamId !== null ? (
          <>
            {tools}
            <LeagueTeam
              /* Keyed on the team alone: the span, the kind and the reading are
                 the chrome's and must not remount the page — only crossing to
                 the other manager is a fresh page rather than one team's rows
                 under the other's name while the read is out. */
              key={sideTeamId}
              teamId={sideTeamId}
              team={teams.get(sideTeamId)}
              start={span.start}
              end={span.end}
              kind={kind}
              reading={reading}
              schedule={reading === 'roster' ? scheduleIndex : null}
              onOpenDetails={onOpenDetails}
            />
          </>
        ) : !away ? (
          // A bye is a real shape rather than a failed read — a 12-team
          // league's first playoff round is two matchups and eight of them — so
          // it says so plainly. The team page still applies: there is one team,
          // and a reader on a bye week has more use for it than for anything
          // else here.
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
                    const state = (s: 'left' | 'right') =>
                      w === null ? '' : w === s ? ' mup-win' : w === 'tie' ? ' mup-tie' : ' mup-loss';
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
      </div>
    </DialogLayerContext.Provider>
  );
}
