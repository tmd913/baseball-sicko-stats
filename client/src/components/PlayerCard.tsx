import { useState } from 'react';
import type { PlayerGame, PlayerReport, RosterStatus } from '../types';
import { playerKey } from '../types';
import { useScrollIntoViewOnExpand } from '../hooks';
import {
  absenceLabel,
  combineLines,
  didNotAppear,
  gameStatusView,
  handThrows,
  hasDoubleheader,
  headshotUrl,
  lineupBadge,
  lineupCorner,
  lineSummary,
  liveRole,
  liveRoleLabel,
  mostRecentGameFirst,
  prettyGameDate,
  rosterStatusBadge,
  seasonStatsSummary,
} from '../lib';
import type { Corner, LiveRole } from '../lib';
import { BaseDiamond } from './BaseDiamond';
import { PlateAppearanceCard } from './PlateAppearanceCard';
import { GameReel } from './GameReel';

export function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-pill">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/**
 * Compact game-state chip: start time (scheduled), score + inning (live), or
 * "Final". With `withMatchup`, a not-yet-started game also shows the opponent
 * and home/away inside the bubble (used where no score badge reveals the teams).
 */
export function GameStatusBadge({ game, withMatchup }: { game: PlayerGame; withMatchup?: boolean }) {
  const { kind, score, detail } = gameStatusView(game);
  const matchup =
    withMatchup && (kind === 'scheduled' || kind === 'postponed')
      ? `${game.isHome ? 'vs' : '@'} ${game.opponent}`
      : null;
  return (
    <span className={`game-status ${kind}`}>
      {score && <span className="game-score">{score}</span>}
      <span className="game-status-detail">{detail}</span>
      {matchup && <span className="game-matchup">{matchup}</span>}
      {kind === 'live' && game.status.bases && (
        <BaseDiamond
          bases={game.status.bases}
          outs={game.status.outs ?? 0}
          className="status-bases"
        />
      )}
    </span>
  );
}

/**
 * Lineup chip once the game's lineup has been posted: "Batting Nth" for a
 * starter (their spot in the order), or "Not in lineup" for a benched player.
 * With `played` set (the batter has already come up), only the batting-order
 * chip is kept — "Not in lineup" is a pre-game / did-not-play state.
 */
function LineupTag({ game, played }: { game: PlayerGame; played?: boolean }) {
  const badge = lineupBadge(game);
  if (!badge || (played && badge.tone !== 'in')) return null;
  return (
    <span className={`lineup-tag lineup-tag-${badge.tone}`} title={badge.title}>
      {badge.label}
    </span>
  );
}

/** The opposing probable starter for a not-yet-started game. */
export function ProbablePitcher({ game }: { game: PlayerGame }) {
  const p = game.probablePitcher;
  if (game.status.state !== 'scheduled' || !p) return null;
  return (
    <span className="game-prob-pitcher" title="Probable starting pitcher">
      vs {handThrows(p.hand)} {p.name}
    </span>
  );
}

/**
 * For a not-yet-started game, the batter's season line against pitchers of the
 * probable starter's hand (e.g. their vs-RHP split when facing a righty).
 */
export function PlatoonSplit({ report, game }: { report: PlayerReport; game: PlayerGame }) {
  const hand = game.probablePitcher?.hand;
  if (game.status.state !== 'scheduled' || (hand !== 'R' && hand !== 'L')) return null;
  const split = hand === 'R' ? report.splitVsRight : report.splitVsLeft;
  const label = `Season vs ${handThrows(hand)}`;

  if (!split || split.pa === 0) {
    return (
      <div className="split-block">
        <div className="split-head">{label}</div>
        <div className="split-empty">No plate appearances vs {handThrows(hand)} this season.</div>
      </div>
    );
  }
  return (
    <div className="split-block">
      <div className="split-head">
        {label} · {split.pa} PA
      </div>
      <div className="stat-row">
        <StatPill label="AVG" value={split.avg} />
        <StatPill label="OBP" value={split.obp} />
        <StatPill label="SLG" value={split.slg} />
        <StatPill label="OPS" value={split.ops} />
        <StatPill label="HR" value={`${split.hr}`} />
        <StatPill label="RBI" value={`${split.rbi}`} />
      </div>
    </div>
  );
}

/**
 * One game's plate appearances. Clicking the bar collapses/expands the whole
 * game; when multiple games are in view they start collapsed so the card stays
 * scannable. Each PA is individually collapsible. When a player has only one
 * game in view, the matchup/line score are already shown in the card header
 * above, so the bar is a plain "Plate appearances" label instead of repeating
 * them.
 */
function GameBlock({
  game,
  report,
  showMatchup,
  spansMultipleDays,
  singleDay,
}: {
  game: PlayerGame;
  report: PlayerReport;
  showMatchup: boolean;
  spansMultipleDays: boolean;
  singleDay: boolean;
}) {
  // Always read top-to-bottom in the order the plate appearances happened,
  // whether the game is live or final.
  const pas = [...game.plateAppearances].sort((a, b) => a.atBatNumber - b.atBatNumber);
  const hasPas = pas.length > 0;
  // Multiple games (showMatchup) start collapsed; a lone game stays open.
  const [collapsed, setCollapsed] = useState(showMatchup);
  // Expanding a game brings it to the top of the screen, like the card and PAs.
  const blockRef = useScrollIntoViewOnExpand<HTMLDivElement>(!collapsed);
  // PAs start collapsed; clicking an individual row opens it.
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const togglePa = (id: number) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The highlight reel: once the game is final (so all its video exists), every
  // at-bat's final play in chronological order, stitched into one sequence. Only
  // at-bats with a playId can have a clip (walks/HBP don't), so gate on those.
  const [reelOpen, setReelOpen] = useState(false);
  const reelPas =
    game.status.state === 'final'
      ? [...game.plateAppearances]
          .filter((pa) => pa.playId)
          .sort((a, b) => a.atBatNumber - b.atBatNumber)
      : [];

  // The bar echoes the card's own header (player-head): an identity block
  // (matchup as the "name", date as the "meta") on the left, and a summary
  // (line + game-status badge) on the right.
  const gameId = (
    <div className="game-sub-id">
      <span className="game-sub-title">
        {game.batterTeam} {game.isHome ? 'vs' : '@'} {game.opponent}
      </span>
      {spansMultipleDays && (
        <span className="game-sub-meta">{prettyGameDate(game.date)}</span>
      )}
    </div>
  );

  // A game the player hasn't batted in yet. When it's scheduled with a known
  // starter, the bar toggles open to reveal the platoon split vs that starter's
  // hand — so a not-yet-started doubleheader gives one expandable panel per game.
  // Otherwise (live but no PAs yet, or no probable pitcher) there's nothing to
  // reveal, so the bar stays static.
  if (!hasPas) {
    const hand = game.probablePitcher?.hand;
    const expandable = game.status.state === 'scheduled' && (hand === 'R' || hand === 'L');
    const barContent = (
      <>
        {gameId}
        <div className="game-sub-summary">
          <LineupTag game={game} />
          <ProbablePitcher game={game} />
          <GameStatusBadge game={game} />
        </div>
      </>
    );
    if (!expandable) {
      return (
        <div ref={blockRef} className="game-block">
          <div className="game-sub-bar static">{barContent}</div>
        </div>
      );
    }
    return (
      <div ref={blockRef} className="game-block">
        <div
          className="game-sub-bar"
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand game' : 'Collapse game'}
          onClick={() => setCollapsed((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setCollapsed((v) => !v);
            }
          }}
        >
          {barContent}
        </div>
        {!collapsed && <PlatoonSplit report={report} game={game} />}
      </div>
    );
  }

  // On a single-day view a lone game's bar is just a redundant "Plate
  // appearances (N)" toggle — the card header already carries the matchup and
  // line — so drop it and show the PAs directly. With several games in view the
  // bar still earns its place (it distinguishes them and toggles each).
  const hideBar = singleDay && !showMatchup;

  return (
    <div ref={blockRef} className="game-block">
      {!hideBar && (
        <div
          className="game-sub-bar"
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand game' : 'Collapse game'}
          onClick={() => setCollapsed((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setCollapsed((v) => !v);
            }
          }}
        >
          {showMatchup ? (
            <>
              {gameId}
              <div className="game-sub-summary">
                <LineupTag game={game} played={hasPas} />
                <span className="game-sub-line">{lineSummary(game.line)}</span>
                <GameStatusBadge game={game} />
              </div>
            </>
          ) : (
            <span className="game-sub-info">
              {`Plate appearances (${game.plateAppearances.length})`}
            </span>
          )}
        </div>
      )}
      {(hideBar || !collapsed) && (
        <div className="pa-grid">
          {reelPas.length > 0 && (
            <div className="reel-bar">
              <button type="button" className="reel-open" onClick={() => setReelOpen(true)}>
                <span className="reel-open-icon" aria-hidden="true">
                  ▶
                </span>
                Highlights
                <span className="reel-open-count">{reelPas.length}</span>
              </button>
            </div>
          )}
          {pas.map((pa) => (
            <PlateAppearanceCard
              key={pa.atBatNumber}
              pa={pa}
              gamePk={game.gamePk}
              open={openIds.has(pa.atBatNumber)}
              onToggle={() => togglePa(pa.atBatNumber)}
            />
          ))}
        </div>
      )}
      {reelOpen && (
        <GameReel
          pas={reelPas}
          gamePk={game.gamePk}
          title={report.name}
          subtitle={`${game.batterTeam} ${game.isHome ? 'vs' : '@'} ${game.opponent}`}
          onClose={() => setReelOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Player headshot, opening the player's details view (percentile rankings) on
 * click. Falls back to a blank circle when MLB has no image for the id.
 * stopPropagation keeps a click from also toggling the (collapsible) card header
 * it sits in. `corner` pins the lineup-spot pip (batting number, or a red "!"
 * when out of the lineup) to the top-right, matching the summary table's headshot.
 */
export function Headshot({
  id,
  name,
  onOpen,
  corner,
  role,
}: {
  id: number;
  name: string;
  onOpen: () => void;
  corner?: Corner;
  role?: LiveRole | null;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={`player-photo-link${role ? ` role-${role}` : ''}`}
      title={`${name} — Statcast details`}
      aria-label={`${name} — Statcast details`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {failed ? (
        <div className="player-photo player-photo-empty" aria-hidden="true" />
      ) : (
        <img
          className="player-photo"
          src={headshotUrl(id)}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      {corner && (
        <span
          className={`lineup-spot player-photo-spot spot-${corner.tone}`}
          title={corner.title}
          aria-label={corner.title}
        >
          {corner.text}
        </span>
      )}
    </button>
  );
}

/** A small tag flagging an off-roster status (IL, suspended, optioned). */
function RosterStatusTag({ status }: { status: RosterStatus | null }) {
  const badge = rosterStatusBadge(status);
  if (!badge) return null;
  return (
    <span className={`roster-status roster-status-${badge.tone}`} title={badge.title}>
      {badge.label}
    </span>
  );
}

/** Live-game role tag — "At bat" / "On deck" / "On base". */
export function LiveRoleTag({ role }: { role: LiveRole | null }) {
  if (!role) return null;
  return <span className={`live-role role-${role}`}>{liveRoleLabel(role)}</span>;
}

/** Flags a two-games-in-a-day slate so a collapsed card still signals it. */
export function DoubleheaderTag({ games }: { games: PlayerGame[] }) {
  if (!hasDoubleheader(games)) return null;
  return (
    <span className="dh-badge" title="Two games on one day">
      Doubleheader
    </span>
  );
}

/** Player name with the fielding position (and any roster-status flag) beside
 *  it. The fantasy lineup slot used to ride here too and now lives only on the
 *  summary table — with the `playerKey` prop that existed to feed it. */
export function PlayerName({
  name,
  position,
  status,
}: {
  name: string;
  position?: string;
  status?: RosterStatus | null;
}) {
  return (
    <span className="player-name">
      {name}
      {position && <span className="player-pos">{position}</span>}
      <RosterStatusTag status={status ?? null} />
    </span>
  );
}

export function PlayerCard({
  report,
  position,
  singleDay,
  collapsed,
  onToggleCollapsed,
  onOpenDetails,
}: {
  report: PlayerReport;
  position?: string;
  singleDay: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenDetails: (key: string) => void;
}) {
  if (didNotAppear(report)) {
    const meta = report.seasonStats ? seasonStatsSummary(report.seasonStats) : null;
    // Any games here are ones the player was rostered for but didn't bat in —
    // show their final score(s) so the card still carries the game info.
    const dnpGames = [...report.games].sort(mostRecentGameFirst);
    return (
      <div className="player-card empty" id={`player-${playerKey(report)}`}>
        <div className="player-head">
          <Headshot id={report.id} name={report.name} onOpen={() => onOpenDetails(playerKey(report))} />
          <div className="player-id">
            <PlayerName
              name={report.name}
              position={position}
              status={report.rosterStatus}
            />
            {meta && <span className="player-meta">{meta}</span>}
          </div>
          <div className="player-summary">
            {singleDay && <DoubleheaderTag games={report.games} />}
            {dnpGames.map((g) => (
              <GameStatusBadge key={g.gamePk} game={g} withMatchup />
            ))}
            <span className="dnp-badge">{absenceLabel(report)}</span>
          </div>
        </div>
      </div>
    );
  }

  // Combine lines across games (usually one). Show most recent games first.
  const games = [...report.games].sort(mostRecentGameFirst);
  const combined = combineLines(games.map((g) => g.line));

  const primary = games[0];
  const summary = lineSummary(combined);
  // Live at-bat/on-deck/on-base state (across the player's live games), shown as
  // a ring on the headshot and a tag in the header.
  const role = liveRole(report);
  const spansMultipleDays = new Set(games.map((g) => g.date)).size > 1;
  // A player may be in view only for an upcoming/just-started game with no plate
  // appearances yet — then the batting line is all zeros and not worth showing.
  const hasAnyPa = games.some((g) => g.plateAppearances.length > 0);
  // Whether expanding actually reveals anything: a game the player batted in, a
  // doubleheader's per-game blocks, or a lone scheduled game's platoon split vs
  // the probable starter. A started game the player hasn't batted in yet has
  // nothing to show, so the card is header-only (not expandable/collapsible).
  const hasScheduledSplit =
    games.length === 1 &&
    primary.status.state === 'scheduled' &&
    (primary.probablePitcher?.hand === 'R' || primary.probablePitcher?.hand === 'L');
  const expandable = games.length > 1 || hasAnyPa || hasScheduledSplit;

  const head = (
    <>
      {/* Lineup slot rides the headshot corner: batting number
          for a starter — kept even after they bat, to show where they hit — or
          a red "!" when out of the lineup before first pitch. Only for a lone
          game; a doubleheader's per-game bars carry their own lineup tags. */}
      <Headshot
        id={report.id}
        name={report.name}
        onOpen={() => onOpenDetails(playerKey(report))}
        corner={games.length === 1 ? lineupCorner(primary) : null}
        role={role}
      />
      <div className="player-id">
        <PlayerName
              name={report.name}
              position={position}
              status={report.rosterStatus}
            />
        <span className="player-meta">
          {report.seasonStats
            ? seasonStatsSummary(report.seasonStats)
            : games.length > 1
              ? `${primary.batterTeam} · ${games.length} games`
              : `${primary.batterTeam} ${primary.isHome ? 'vs' : '@'} ${primary.opponent}`}
        </span>
      </div>
      <div className="player-summary">
        {/* Live role (at bat / on deck / on base) leads the summary when active. */}
        <LiveRoleTag role={role} />
        {/* The doubleheader flag can't say which day it was, so on a collapsed
            card it only makes sense for a single-day range; when expanded, the
            game blocks below show the two same-day games regardless. */}
        {(!collapsed || singleDay) && <DoubleheaderTag games={games} />}
        {hasAnyPa && <span className="summary-line">{summary}</span>}
        {games.length === 1 && <ProbablePitcher game={primary} />}
        {/* A not-yet-started game has no score badge to reveal the teams, so
            the badge also carries the opponent and home/away (withMatchup). */}
        {games.length === 1 && <GameStatusBadge game={primary} withMatchup />}
      </div>
    </>
  );

  return (
    <div
      className={`player-card${expandable && collapsed ? ' collapsed' : ''}`}
      id={`player-${playerKey(report)}`}
    >
      {expandable ? (
        // The whole header toggles collapse; inner link/buttons stop propagation.
        <div
          className="player-head player-head-toggle"
          role="button"
          tabIndex={0}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
          onClick={onToggleCollapsed}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleCollapsed();
            }
          }}
        >
          {head}
        </div>
      ) : (
        // Nothing to reveal (e.g. a live game the player hasn't batted in yet):
        // a plain, non-interactive header.
        <div className="player-head">{head}</div>
      )}

      {expandable && !collapsed && (
        <>
          {/* A lone not-yet-started game has no game block of its own (its matchup
              lives in the header), so its platoon split vs the starter's hand
              shows here. Multi-game cards render each game's split inside its own
              block instead (see GameBlock), so a doubleheader pairs them up. */}
          {games.length === 1 && <PlatoonSplit report={report} game={primary} />}

          {games
            // A lone no-PA game is fully described by the header's status badge,
            // so skip its empty block; keep it when several games share the card.
            .filter((g) => g.plateAppearances.length > 0 || games.length > 1)
            .map((g) => (
              <GameBlock
                key={g.gamePk}
                game={g}
                report={report}
                showMatchup={games.length > 1}
                spansMultipleDays={spansMultipleDays}
                singleDay={singleDay}
              />
            ))}
        </>
      )}
    </div>
  );
}
