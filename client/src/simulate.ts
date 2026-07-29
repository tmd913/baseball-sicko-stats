import type { LiveRole } from './lib';
import type { BaseState, GameStatus, PlayerGame, PlayerReport } from './types';

// How many watched players get pulled into the simulated live slate. The first
// is put at bat, the second on deck, the rest on base — enough to populate the
// feed's Live section and light up every live-role treatment in the UI.
const MAX_LIVE_PLAYERS = 6;

function roleForIndex(i: number): LiveRole {
  return i === 0 ? 'at-bat' : i === 1 ? 'on-deck' : 'on-base';
}

/**
 * Overlay a synthetic in-progress state onto one of a player's games so the
 * live-only UI can be demoed when no games are actually underway. Values are
 * derived from the player id (not random) so the picture stays stable across
 * re-renders and background refetches. Returns a fresh game/status — the
 * original report data is never mutated.
 */
function toLiveGame(game: PlayerGame, playerId: number, role: LiveRole): PlayerGame {
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
  const bases: BaseState = {
    first: onBase || playerId % 2 === 0,
    second: playerId % 3 === 0,
    third: playerId % 4 === 0,
  };
  const status: GameStatus = {
    ...game.status,
    state: 'live',
    detailedState: 'In Progress',
    // The batting team is the player's team, so its half of the inning is up.
    homeScore: (playerId >> 1) % 6,
    awayScore: playerId % 5,
    currentInning: inning,
    inningState: game.isHome ? 'Bottom' : 'Top',
    isTopInning: !game.isHome,
    bases,
    outs: playerId % 3,
    atBatId: role === 'at-bat' ? playerId : null,
    onDeckId: role === 'on-deck' ? playerId : null,
    onBaseIds: onBase ? [playerId] : [],
  };
  return { ...game, status, plateAppearances };
}

/**
 * Paint a fake "live day" over the loaded reports: take the first several
 * watched players who actually batted today and flip their most recent game to
 * an in-progress state, assigning them live roles (one at bat, one on deck, the
 * rest on base). Used by the "Simulate live" UI toggle to exercise the feed's
 * Live section, the role rings, and live game-status badges without a real
 * live game. A no-op-shaped copy for players not chosen; never mutates input.
 */
export function simulateLiveDay(reports: PlayerReport[]): PlayerReport[] {
  const eligible = reports.filter((r) =>
    r.games.some((g) => g.plateAppearances.length > 0),
  );
  const roleById = new Map<number, LiveRole>();
  eligible.slice(0, MAX_LIVE_PLAYERS).forEach((r, i) => roleById.set(r.id, roleForIndex(i)));

  return reports.map((r) => {
    const role = roleById.get(r.id);
    if (!role) return r;
    // Flip the player's most recent game that has plate appearances (games are
    // ordered oldest-first) to the simulated live state.
    let target = -1;
    for (let i = r.games.length - 1; i >= 0; i--) {
      if (r.games[i].plateAppearances.length > 0) {
        target = i;
        break;
      }
    }
    if (target === -1) return r;
    const games = r.games.map((g, i) => (i === target ? toLiveGame(g, r.id, role) : g));
    return { ...r, games };
  });
}
