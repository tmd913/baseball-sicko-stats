import { useState } from 'react';
import type { PlayerGame, PlayerReport, RosterStatus } from '../types';
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
  prettyGameDate,
  rosterStatusBadge,
  seasonStatsSummary,
} from '../lib';
import type { LiveRole } from '../lib';
import { BaseDiamond } from './BaseDiamond';
import { PlateAppearanceCard } from './PlateAppearanceCard';

function StatPill({ label, value }: { label: string; value: string }) {
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
function GameStatusBadge({ game, withMatchup }: { game: PlayerGame; withMatchup?: boolean }) {
  const { kind, score, detail } = gameStatusView(game);
  const matchup =
    withMatchup && kind === 'scheduled' ? `${game.isHome ? 'vs' : '@'} ${game.opponent}` : null;
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
function ProbablePitcher({ game }: { game: PlayerGame }) {
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
function PlatoonSplit({ report, game }: { report: PlayerReport; game: PlayerGame }) {
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
  // While a game is live, show the most recent plate appearance first so the
  // latest at-bat is at the top; once it's final, read top-to-bottom in the
  // order they happened.
  const live = game.status.state === 'live';
  const pas = [...game.plateAppearances].sort((a, b) =>
    live ? b.atBatNumber - a.atBatNumber : a.atBatNumber - b.atBatNumber,
  );
  const hasPas = pas.length > 0;
  // Multiple games (showMatchup) start collapsed; a lone game stays open.
  const [collapsed, setCollapsed] = useState(showMatchup);
  // PAs start collapsed; clicking an individual row opens it.
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const togglePa = (id: number) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
        <div className="game-block">
          <div className="game-sub-bar static">{barContent}</div>
        </div>
      );
    }
    return (
      <div className="game-block">
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
    <div className="game-block">
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
    </div>
  );
}

/**
 * Player headshot, opening the player's details view (percentile rankings) on
 * click. Falls back to a blank circle when MLB has no image for the id.
 * stopPropagation keeps a click from also toggling the (collapsible) card header
 * it sits in. `corner` pins the lineup-spot pip (batting number, or a red "!"
 * when out of the lineup) to the top-right, matching the player-nav avatar.
 */
function Headshot({
  id,
  name,
  onOpen,
  corner,
  role,
}: {
  id: number;
  name: string;
  onOpen: () => void;
  corner?: { text: string; title: string; tone: 'in' | 'out' } | null;
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
          aria-label={corner.tone === 'out' ? 'Not in lineup' : `Batting ${corner.text}`}
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

/** Live-game role tag — "At bat" / "On deck" / "On base" — matching the nav. */
function LiveRoleTag({ role }: { role: LiveRole | null }) {
  if (!role) return null;
  return <span className={`live-role role-${role}`}>{liveRoleLabel(role)}</span>;
}

/** Flags a two-games-in-a-day slate so a collapsed card still signals it. */
function DoubleheaderTag({ games }: { games: PlayerGame[] }) {
  if (!hasDoubleheader(games)) return null;
  return (
    <span className="dh-badge" title="Two games on one day">
      Doubleheader
    </span>
  );
}

/** Player name with the fielding position (and any roster-status flag) beside it. */
function PlayerName({
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
  onOpenDetails: (id: number) => void;
}) {
  if (didNotAppear(report)) {
    const meta = report.seasonStats ? seasonStatsSummary(report.seasonStats) : null;
    // Any games here are ones the player was rostered for but didn't bat in —
    // show their final score(s) so the card still carries the game info.
    const dnpGames = [...report.games].sort(
      (a, b) => b.date.localeCompare(a.date) || b.gamePk - a.gamePk,
    );
    return (
      <div className="player-card empty" id={`player-${report.id}`}>
        <div className="player-head">
          <Headshot id={report.id} name={report.name} onOpen={() => onOpenDetails(report.id)} />
          <div className="player-id">
            <PlayerName name={report.name} position={position} status={report.rosterStatus} />
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
  const games = [...report.games].sort(
    (a, b) => b.date.localeCompare(a.date) || b.gamePk - a.gamePk,
  );
  const combined = combineLines(games.map((g) => g.line));

  const primary = games[0];
  const summary = lineSummary(combined);
  // Live at-bat/on-deck/on-base state (across the player's live games), shown as
  // a ring on the headshot and a tag in the header, as in the nav.
  const role = liveRole(report);
  const spansMultipleDays = new Set(games.map((g) => g.date)).size > 1;
  // A player may be in view only for an upcoming/just-started game with no plate
  // appearances yet — then the batting line is all zeros and not worth showing.
  const hasAnyPa = games.some((g) => g.plateAppearances.length > 0);

  return (
    <div
      className={`player-card${collapsed ? ' collapsed' : ''}`}
      id={`player-${report.id}`}
    >
      {/* The whole header toggles collapse; inner link/buttons stop propagation. */}
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
        {/* Lineup slot rides the headshot corner (as in the nav): batting number
            for a starter — kept even after they bat, to show where they hit — or
            a red "!" when out of the lineup before first pitch. Only for a lone
            game; a doubleheader's per-game bars carry their own lineup tags. */}
        <Headshot
          id={report.id}
          name={report.name}
          onOpen={() => onOpenDetails(report.id)}
          corner={games.length === 1 ? lineupCorner(primary) : null}
          role={role}
        />
        <div className="player-id">
          <PlayerName name={report.name} position={position} status={report.rosterStatus} />
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
      </div>

      {!collapsed && (
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
