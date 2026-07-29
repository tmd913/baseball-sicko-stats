import { useState, type ReactNode } from 'react';
import type { LiveRole } from '../lib';
import { playerKey } from '../types';
import {
  eventLabel,
  formatStartTime,
  headshotUrl,
  liveRoleGame,
  liveRoleLabel,
  outcomeKind,
} from '../lib';
import type { BaseEvent, FacedBatter, PlateAppearance, PlayerGame, PlayerReport } from '../types';
import { useScrollIntoViewOnExpand } from '../hooks';
import { InlineVideoClip, PlateAppearanceCard } from './PlateAppearanceCard';
import { PlatoonSplit, ProbablePitcher } from './PlayerCard';

/** Priority order for the Live section: at bat, then on deck, then on base. */
const ROLE_ORDER: Record<LiveRole, number> = {
  'at-bat': 0,
  'on-deck': 1,
  'on-base': 2,
  pitching: 3,
};

/** A player's live game inning, e.g. "Top 7" (falls back to the game's label). */
function liveInning(game: PlayerGame): string {
  const s = game.status;
  return s.currentInning !== null
    ? `${s.inningState ?? ''} ${s.currentInning}`.trim()
    : s.detailedState || 'Live';
}

/** The matchup line, "NYY vs BOS" / "NYY @ BOS", from the batter's perspective. */
function matchup(game: PlayerGame): string {
  return `${game.batterTeam} ${game.isHome ? 'vs' : '@'} ${game.opponent}`;
}

/** The in-progress plate appearance (no final event yet) — the batter's current at-bat. */
function currentAtBat(game: PlayerGame): PlateAppearance | null {
  const inProgress = game.plateAppearances.filter((pa) => !pa.event);
  return inProgress.length ? inProgress[inProgress.length - 1] : null;
}

/** The batter's most recent completed plate appearance in a game (highest at-bat number). */
function mostRecentCompleted(game: PlayerGame): PlateAppearance | null {
  let best: PlateAppearance | null = null;
  for (const pa of game.plateAppearances) {
    if (pa.event && (!best || pa.atBatNumber > best.atBatNumber)) best = pa;
  }
  return best;
}

/**
 * The at-bat to surface for a player's live role: the current (in-progress)
 * at-bat while they're batting, their most recent completed at-bat (the one that
 * put them there) while on base. On deck there's nothing to show yet.
 */
function roleAtBat(role: LiveRole, game: PlayerGame): PlateAppearance | null {
  if (role === 'at-bat') return currentAtBat(game);
  if (role === 'on-base') return mostRecentCompleted(game);
  return null;
}

/** A recent-stream item: a plate appearance, a base-running event, or (for a
 * watched pitcher) a batter they faced. */
type FeedEntry =
  | { type: 'pa'; report: PlayerReport; game: PlayerGame; pa: PlateAppearance }
  | { type: 'base'; report: PlayerReport; game: PlayerGame; ev: BaseEvent; i: number }
  | { type: 'faced'; report: PlayerReport; game: PlayerGame; fb: FacedBatter; i: number };

/** Sort key for the recent stream: the item's timestamp, falling back to the end
 * of the game's date so undated cached items still land on the right day. */
function entryTime(e: FeedEntry): number {
  const ts = e.type === 'pa' ? e.pa.timestamp : e.type === 'faced' ? e.fb.timestamp : e.ev.timestamp;
  if (ts) {
    const t = Date.parse(ts);
    if (!Number.isNaN(t)) return t;
  }
  const d = Date.parse(`${e.game.date}T23:59:59Z`);
  return Number.isNaN(d) ? 0 : d;
}

/**
 * A player's name in a feed row — a button that jumps to their full day of
 * at-bats on the players view. stopPropagation so it doesn't also toggle a
 * collapsible the name sits inside (the live/upcoming row headers).
 */
function FeedPlayerName({
  playerKey: key,
  name,
  onOpen,
}: {
  playerKey: string;
  name: string;
  onOpen: (key: string) => void;
}) {
  return (
    <button
      type="button"
      className="feed-player-name feed-player-name-link"
      title={`${name} — full day`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(key);
      }}
    >
      {name}
    </button>
  );
}

/**
 * A player's headshot, opening their Statcast details on click. A compact
 * variant of the player card's headshot; `role` paints the live-role ring.
 */
function FeedHeadshot({
  id,
  name,
  role,
  onOpen,
}: {
  id: number;
  name: string;
  role?: LiveRole | null;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={`feed-photo-link${role ? ` role-${role}` : ''}`}
      title={`${name} — Statcast details`}
      aria-label={`${name} — Statcast details`}
      onClick={(e) => {
        // Don't also toggle a collapsible row this headshot sits inside.
        e.stopPropagation();
        onOpen();
      }}
    >
      {failed ? (
        <span className="feed-photo feed-photo-empty" aria-hidden="true" />
      ) : (
        <img
          className="feed-photo"
          src={headshotUrl(id)}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}

/**
 * One player in the Live section. The header carries the headshot (role ring),
 * name, matchup + inning, and the role tag; beneath it, the batter's current
 * at-bat (while up) or most recent one (while on base) — nothing extra on deck.
 */
function LiveEntry({
  report,
  role,
  game,
  open,
  onToggle,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  role: LiveRole;
  game: PlayerGame;
  open: boolean;
  onToggle: () => void;
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  const pa = roleAtBat(role, game);
  // Scroll the whole item (player header + at-bat) into view on expand, so the
  // player info isn't cut off above the viewport — the card itself doesn't scroll.
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  return (
    <div className={`feed-item live-entry role-${role}`} ref={ref}>
      <div className="feed-item-head">
        <FeedHeadshot
          id={report.id}
          name={report.name}
          role={role}
          onOpen={() => onOpenDetails(playerKey(report))}
        />
        <div className="feed-item-id">
          <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
          <span className="feed-context">
            {matchup(game)} · {liveInning(game)}
          </span>
        </div>
        <span className={`live-role role-${role}`}>{liveRoleLabel(role)}</span>
      </div>
      {pa && (
        <PlateAppearanceCard
          pa={pa}
          gamePk={game.gamePk}
          open={open}
          onToggle={onToggle}
          autoScroll={false}
          showVideo={false}
        />
      )}
      {pa?.playId && <InlineVideoClip playId={pa.playId} gamePk={game.gamePk} />}
    </div>
  );
}

/** One completed at-bat in the Recent section: player header + the at-bat card. */
function FeedAtBat({
  report,
  game,
  pa,
  open,
  onToggle,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  game: PlayerGame;
  pa: PlateAppearance;
  open: boolean;
  onToggle: () => void;
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  // Expanding scrolls the whole item to the top so the player header stays in
  // view above the at-bat detail (the card itself doesn't self-scroll).
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(open);
  return (
    <div className="feed-item" ref={ref}>
      <div className="feed-item-head">
        <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
        <div className="feed-item-id">
          <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
          <span className="feed-context">{matchup(game)}</span>
        </div>
      </div>
      <PlateAppearanceCard
        pa={pa}
        gamePk={game.gamePk}
        open={open}
        onToggle={onToggle}
        autoScroll={false}
        showVideo={false}
      />
      {pa.playId && <InlineVideoClip playId={pa.playId} gamePk={game.gamePk} />}
    </div>
  );
}

/** The label for a base-running feed event, e.g. "Stole 2nd" or "Run Scored". */
function baseEventLabel(ev: BaseEvent): string {
  if (ev.kind === 'run') return 'Run Scored';
  return ev.base ? `Stole ${ev.base}` : 'Stolen Base';
}

/**
 * One base-running event in the Recent section — a stolen base or a run scored.
 * Same player header as an at-bat, then a compact badge (no pitch card/video,
 * since it isn't a plate appearance).
 */
function FeedBaseEvent({
  report,
  game,
  ev,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  game: PlayerGame;
  ev: BaseEvent;
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  return (
    <div className="feed-item">
      <div className="feed-item-head">
        <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
        <div className="feed-item-id">
          <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
          <span className="feed-context">{matchup(game)}</span>
        </div>
      </div>
      <div className={`feed-base kind-${ev.kind}`}>
        <span className="feed-base-inning">
          {ev.half} {ev.inning}
        </span>
        <span className="feed-base-badge">{baseEventLabel(ev)}</span>
      </div>
    </div>
  );
}

/** One batter a watched pitcher faced, in the recent stream — the pitcher header
 * plus the result (no pitch-by-pitch detail). */
function FeedFacedBatter({
  report,
  game,
  fb,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  game: PlayerGame;
  fb: FacedBatter;
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  const kind = outcomeKind(fb.event);
  return (
    <div className="feed-item">
      <div className="feed-item-head">
        <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
        <div className="feed-item-id">
          <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
          <span className="feed-context">
            {matchup(game)} · pitching
          </span>
        </div>
      </div>
      <div className={`faced-row kind-${kind}`}>
        <span className="feed-base-inning">
          {fb.half} {fb.inning}
        </span>
        <span className={`pa-badge kind-${kind}`}>{eventLabel(fb.event)}</span>
        {fb.rbi > 0 && <span className="pa-rbi">{fb.rbi} RBI</span>}
        <span className="faced-batter">
          vs {fb.batterName}
          {fb.stand ? <span className="faced-hand"> ({fb.stand})</span> : null}
        </span>
        {fb.launchSpeed !== null && (
          <span className="pa-contact-main">{fb.launchSpeed.toFixed(1)} mph</span>
        )}
      </div>
    </div>
  );
}

/** Order not-yet-started games by first pitch (earliest first); unknown times last. */
function byStartTime(
  a: { game: PlayerGame },
  b: { game: PlayerGame },
): number {
  const ta = a.game.status.startTime;
  const tb = b.game.status.startTime;
  if (ta && tb) return ta.localeCompare(tb);
  if (ta) return -1;
  if (tb) return 1;
  return 0;
}

/**
 * One not-yet-started game in the Upcoming section: player + matchup + first
 * pitch. The header collapses/expands the batter's platoon split vs the probable
 * starter — but only when there's a probable pitcher to reveal; otherwise the
 * header is static (nothing to show yet).
 */
function UpcomingRow({
  report,
  game,
  open,
  onToggle,
  onOpenDetails,
  onOpenPlayerDay,
}: {
  report: PlayerReport;
  game: PlayerGame;
  open: boolean;
  onToggle: () => void;
  onOpenDetails: (key: string) => void;
  onOpenPlayerDay: (key: string) => void;
}) {
  const time = formatStartTime(game.status.startTime);
  const expandable = !!game.probablePitcher;
  // On expand, bring the row to the top of the viewport (its scroll-margin-top
  // clears the sticky nav), matching how the at-bat cards behave.
  const ref = useScrollIntoViewOnExpand<HTMLDivElement>(expandable && open);
  const head = (
    <>
      <FeedHeadshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
      <div className="live-row-id">
        <FeedPlayerName playerKey={playerKey(report)} name={report.name} onOpen={onOpenPlayerDay} />
        <span className="feed-context">{matchup(game)}</span>
      </div>
      <span className="feed-time">{time ?? (game.status.detailedState || 'TBD')}</span>
      {expandable && (
        <svg
          className={`upcoming-caret${open ? ' open' : ''}`}
          viewBox="0 0 12 8"
          aria-hidden="true"
        >
          <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )}
    </>
  );

  return (
    <div className="upcoming-item" ref={ref}>
      {expandable ? (
        <div
          className="upcoming-head"
          role="button"
          tabIndex={0}
          aria-expanded={open}
          title={open ? 'Collapse' : 'Expand platoon split'}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          {head}
        </div>
      ) : (
        <div className="upcoming-head static">{head}</div>
      )}
      {/* The batter's season line against the probable starter's hand. */}
      {expandable && open && (
        <div className="upcoming-detail">
          <ProbablePitcher game={game} />
          <PlatoonSplit report={report} game={game} />
        </div>
      )}
    </div>
  );
}

/**
 * A feed section's rows, split into the watched hitters' and the watched
 * pitchers' halves so the two never interleave. The Batters/Pitchers
 * subheadings only appear when the section actually holds both kinds —
 * with one kind on the watchlist the section heading already says it all.
 * Order within each half is untouched (newest-first, or by role/start time).
 */
function KindSplit<T extends { report: PlayerReport }>({
  rows,
  className,
  render,
}: {
  rows: T[];
  // The row container's class, applied to each half separately.
  className: string;
  render: (row: T) => ReactNode;
}) {
  const batters = rows.filter((r) => r.report.kind !== 'pitcher');
  const pitchers = rows.filter((r) => r.report.kind === 'pitcher');
  const both = batters.length > 0 && pitchers.length > 0;
  return (
    <>
      {both && <h3 className="kind-heading">Batters</h3>}
      {batters.length > 0 && <div className={className}>{batters.map(render)}</div>}
      {both && <h3 className="kind-heading">Pitchers</h3>}
      {pitchers.length > 0 && <div className={className}>{pitchers.map(render)}</div>}
    </>
  );
}

/**
 * The watchlist as a flat, most-recent-first stream of individual at-bats —
 * shown while games are active. A "Live" section pins the players currently at
 * bat, on deck, or on base to the top; below it, every completed plate
 * appearance across the watchlist reads newest-first, each labeled with just the
 * player (name + headshot) and the at-bat itself — none of the per-player stats,
 * season line, or score chrome the grouped player view carries.
 */
export function LiveFeed({
  reports,
  onOpenDetails,
  onOpenPlayerDay,
  openKeys,
  onToggleKey,
}: {
  reports: PlayerReport[];
  onOpenDetails: (key: string) => void;
  // Jump to a player's full day of at-bats on the players view.
  onOpenPlayerDay: (key: string) => void;
  // Which at-bats / upcoming rows are expanded, keyed by player + game + at-bat
  // number. Lifted to the parent so a "collapse all" control can clear them.
  openKeys: Set<string>;
  onToggleKey: (key: string) => void;
}) {
  const toggle = onToggleKey;

  // Players currently in a live at-bat/on-deck/on-base situation, highest-
  // priority role first (a player is listed once, for their leading role).
  const liveRows = reports
    .map((report) => {
      const lr = liveRoleGame(report);
      return lr ? { report, role: lr.role, game: lr.game } : null;
    })
    .filter((x): x is { report: PlayerReport; role: LiveRole; game: PlayerGame } => x !== null)
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

  // Every completed plate appearance plus every base-running event (stolen
  // bases, runs scored) across the watchlist, interleaved newest-first. The
  // in-progress at-bat (no event yet) lives in the Live section above, not here.
  const recent = reports
    .flatMap((report) =>
      report.games.flatMap((game): FeedEntry[] => [
        ...game.plateAppearances
          .filter((pa) => pa.event)
          .map((pa): FeedEntry => ({ type: 'pa', report, game, pa })),
        ...game.baseEvents.map((ev, i): FeedEntry => ({ type: 'base', report, game, ev, i })),
        // A watched pitcher's game contributes each batter they faced.
        ...(game.pitching?.facedBatters ?? []).map(
          (fb, i): FeedEntry => ({ type: 'faced', report, game, fb, i }),
        ),
      ]),
    )
    .sort((a, b) => {
      const t = entryTime(b) - entryTime(a);
      if (t) return t;
      const gn = (b.game.gameNumber ?? 0) - (a.game.gameNumber ?? 0);
      if (gn) return gn;
      return b.game.gamePk - a.game.gamePk;
    });

  // Not-yet-started games, earliest first pitch first — so the feed still has
  // something to show before the day's first at-bat (and lists later games while
  // earlier ones are underway).
  const upcoming = reports
    .flatMap((report) =>
      report.games
        .filter((game) => game.status.state === 'scheduled')
        .map((game) => ({ report, game })),
    )
    .sort(byStartTime);

  const isEmpty = liveRows.length === 0 && recent.length === 0 && upcoming.length === 0;

  return (
    <div className="live-feed">
      {liveRows.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">
            <span className="feed-heading-dot" aria-hidden="true" />
            Live
          </h2>
          <KindSplit
            rows={liveRows}
            className="live-rows"
            render={({ report, role, game }) => {
              const key = `live-${report.id}`;
              return (
                <LiveEntry
                  key={report.id}
                  report={report}
                  role={role}
                  game={game}
                  open={openKeys.has(key)}
                  onToggle={() => toggle(key)}
                  onOpenDetails={onOpenDetails}
                  onOpenPlayerDay={onOpenPlayerDay}
                />
              );
            }}
          />
        </section>
      )}

      {recent.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">Recent plays</h2>
          <KindSplit
            rows={recent}
            className="feed-items"
            render={(entry) => {
              if (entry.type === 'base') {
                const { report, game, ev, i } = entry;
                return (
                  <FeedBaseEvent
                    key={`base-${report.id}-${game.gamePk}-${i}`}
                    report={report}
                    game={game}
                    ev={ev}
                    onOpenDetails={onOpenDetails}
                    onOpenPlayerDay={onOpenPlayerDay}
                  />
                );
              }
              if (entry.type === 'faced') {
                const { report, game, fb, i } = entry;
                return (
                  <FeedFacedBatter
                    key={`faced-${report.id}-${game.gamePk}-${i}`}
                    report={report}
                    game={game}
                    fb={fb}
                    onOpenDetails={onOpenDetails}
                    onOpenPlayerDay={onOpenPlayerDay}
                  />
                );
              }
              const { report, game, pa } = entry;
              const key = `${report.id}-${game.gamePk}-${pa.atBatNumber}`;
              return (
                <FeedAtBat
                  key={key}
                  report={report}
                  game={game}
                  pa={pa}
                  open={openKeys.has(key)}
                  onToggle={() => toggle(key)}
                  onOpenDetails={onOpenDetails}
                  onOpenPlayerDay={onOpenPlayerDay}
                />
              );
            }}
          />
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="feed-section">
          <h2 className="feed-heading">Upcoming</h2>
          <KindSplit
            rows={upcoming}
            className="upcoming-rows"
            render={({ report, game }) => {
              const key = `up-${report.id}-${game.gamePk}`;
              return (
                <UpcomingRow
                  key={key}
                  report={report}
                  game={game}
                  open={openKeys.has(key)}
                  onToggle={() => toggle(key)}
                  onOpenDetails={onOpenDetails}
                  onOpenPlayerDay={onOpenPlayerDay}
                />
              );
            }}
          />
        </section>
      )}

      {isEmpty && <div className="feed-empty">No games for these players.</div>}
    </div>
  );
}
