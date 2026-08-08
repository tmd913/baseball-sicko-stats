import type { LiveRole } from './lib';
import { playerKey } from './types';
import type { BaseState, GameStatus, PlayerGame, PlayerReport } from './types';

// How many watched players of each kind get pulled into the simulated live
// slate. The first batter is put at bat, the second on deck, the rest on base —
// enough to populate the feed's Live section and light up every live-role
// treatment. Pitchers are capped lower because each one takes over a whole
// game (one arm on the mound per game).
const MAX_LIVE_BATTERS = 6;
const MAX_LIVE_PITCHERS = 3;

function roleForIndex(i: number): LiveRole {
  return i === 0 ? 'at-bat' : i === 1 ? 'on-deck' : 'on-base';
}

/** Has this player actually done anything in the game — batted, or thrown? */
function hasMaterial(report: PlayerReport, game: PlayerGame): boolean {
  return report.kind === 'pitcher'
    ? game.pitching !== null
    : game.plateAppearances.length > 0;
}

/**
 * The game to paint live: the most recent one with something to show (plate
 * appearances for a batter, an outing for a pitcher), else the most recent one
 * that hasn't been called off — a scheduled game is the whole point of the
 * toggle, since the day you reach for it is the day nothing has started yet.
 * Games are ordered oldest-first. Returns -1 when the player has no game.
 */
function targetGame(report: PlayerReport): number {
  for (let i = report.games.length - 1; i >= 0; i--) {
    if (hasMaterial(report, report.games[i])) return i;
  }
  for (let i = report.games.length - 1; i >= 0; i--) {
    if (report.games[i].status.state !== 'postponed') return i;
  }
  return -1;
}

/** Runners on, derived from the id so the picture is stable across renders. */
function basesFor(playerId: number, onBase: boolean): BaseState {
  return {
    first: onBase || playerId % 2 === 0,
    second: playerId % 3 === 0,
    third: playerId % 4 === 0,
  };
}

/** The shared parts of a synthetic in-progress status. */
function liveStatus(
  game: PlayerGame,
  playerId: number,
  inning: number,
  isTop: boolean,
  bases: BaseState,
): GameStatus {
  return {
    ...game.status,
    state: 'live',
    detailedState: 'In Progress',
    homeScore: (playerId >> 1) % 6,
    awayScore: playerId % 5,
    currentInning: inning,
    inningState: isTop ? 'Top' : 'Bottom',
    isTopInning: isTop,
    bases,
    outs: playerId % 3,
    atBatId: null,
    onDeckId: null,
    onBaseIds: [],
    pitchingId: null,
  };
}

/**
 * Overlay a synthetic in-progress state onto one of a batter's games so the
 * live-only UI can be demoed when no games are actually underway. Values are
 * derived from the player id (not random) so the picture stays stable across
 * re-renders and background refetches. Returns a fresh game/status — the
 * original report data is never mutated.
 */
function toLiveBatterGame(game: PlayerGame, playerId: number, role: LiveRole): PlayerGame {
  // For the batter shown at bat, turn their most recent plate appearance into an
  // in-progress one (no final event) so the feed's Live section has a "current
  // at-bat" to render, mirroring how a genuinely live at-bat looks in the feed.
  let plateAppearances = game.plateAppearances;
  if (role === 'at-bat') {
    let lastIdx = -1;
    for (let i = 0; i < plateAppearances.length; i++) {
      if (plateAppearances[i].event) lastIdx = i;
    }
    if (lastIdx !== -1) {
      plateAppearances = plateAppearances.map((pa, i) =>
        i === lastIdx ? { ...pa, event: null, description: '', rbi: 0 } : pa,
      );
    }
  }
  const inning = 4 + (playerId % 6); // a believable mid/late inning (4–9)
  const onBase = role === 'on-base';
  // The batting team is the player's team, so its half of the inning is up.
  const status: GameStatus = {
    ...liveStatus(game, playerId, inning, !game.isHome, basesFor(playerId, onBase)),
    atBatId: role === 'at-bat' ? playerId : null,
    onDeckId: role === 'on-deck' ? playerId : null,
    onBaseIds: onBase ? [playerId] : [],
  };
  return { ...game, status, plateAppearances };
}

/**
 * The same for a pitcher's game: he takes the mound (`pitchingId`), which is
 * what the feed's Live section and the card's live-inning accent read. The
 * inning is the last one he actually worked, so the accent lands on a half that
 * exists — and his half is the one the *opponent* bats in, the mirror of the
 * batter case. With no outing under him yet the item is just his header, the
 * same as a reliever who's been announced but hasn't recorded anything.
 */
function toLivePitcherGame(game: PlayerGame, playerId: number): PlayerGame {
  const faced = game.pitching?.facedBatters ?? [];
  const last = faced.length > 0 ? faced[faced.length - 1] : null;
  const inning = last ? last.inning : 4 + (playerId % 6);
  const isTop = last ? last.half === 'Top' : game.isHome;
  const status: GameStatus = {
    ...liveStatus(game, playerId, inning, isTop, basesFor(playerId, false)),
    pitchingId: playerId,
  };
  return { ...game, status };
}

/** A player and the index of the game chosen to be painted live. */
type Selection = { report: PlayerReport; index: number };

/**
 * Paint a fake "live day" over the loaded reports: take the first several
 * watched players of each kind and flip one of their games to an in-progress
 * state — batters given live roles (one at bat, one on deck, the rest on base),
 * pitchers put on the mound. Used by the "Simulate live" UI toggle to exercise
 * the feed's Live section, the role rings, the live-inning accent and the live
 * game-status badges without a real live game. Players not chosen come back
 * untouched; never mutates input.
 */
export function simulateLiveDay(reports: PlayerReport[]): PlayerReport[] {
  const batters: Selection[] = [];
  const pitchers: Selection[] = [];
  for (const report of reports) {
    const index = targetGame(report);
    if (index === -1) continue;
    (report.kind === 'pitcher' ? pitchers : batters).push({ report, index });
  }

  const targetByKey = new Map<string, number>();
  const roleByKey = new Map<string, LiveRole>();
  // Players who already have something under them go first, so the at-bat
  // treatment (an in-progress plate appearance) and the mound treatment (an
  // outing's innings) land on someone who can show them. This reorders without
  // dropping anyone: on a slate where nothing has started, the list is
  // unchanged and the day is simulated off scheduled games alone — which is
  // exactly the day the toggle is for.
  const playedFirst = (entries: Selection[]) => [
    ...entries.filter((e) => hasMaterial(e.report, e.report.games[e.index])),
    ...entries.filter((e) => !hasMaterial(e.report, e.report.games[e.index])),
  ];

  playedFirst(batters)
    .slice(0, MAX_LIVE_BATTERS)
    .forEach(({ report, index }, i) => {
      targetByKey.set(playerKey(report), index);
      roleByKey.set(playerKey(report), roleForIndex(i));
    });

  // Only one watched arm per game — two of them can't share a mound.
  const claimedGames = new Set<number>();
  let livePitchers = 0;
  for (const { report, index } of playedFirst(pitchers)) {
    if (livePitchers >= MAX_LIVE_PITCHERS) break;
    const game = report.games[index];
    if (claimedGames.has(game.gamePk)) continue;
    claimedGames.add(game.gamePk);
    targetByKey.set(playerKey(report), index);
    livePitchers++;
  }

  return reports.map((report) => {
    const key = playerKey(report);
    const target = targetByKey.get(key);
    if (target === undefined) return report;
    const games = report.games.map((g, i) => {
      if (i !== target) return g;
      return report.kind === 'pitcher'
        ? toLivePitcherGame(g, report.id)
        : toLiveBatterGame(g, report.id, roleByKey.get(key) ?? 'on-base');
    });
    return { ...report, games };
  });
}
