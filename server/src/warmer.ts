import { getDay } from './savant.js';
import { getSeasonArsenal } from './pitcherArsenal.js';
import { getPercentiles } from './percentiles.js';
import { getPitcherStats, getPlayerStats, getSeasonPlayers } from './mlbStats.js';
import { getAllWatchedPlayers } from './store.js';
import { mapLimit } from './limit.js';
import { baseballToday } from './etDate.js';

/**
 * The scheduled cache warmer.
 *
 * Building a day from cold costs a schedule fetch, a feed and win-probability
 * blob per game, and a multi-MB Savant CSV — comfortably more than API
 * Gateway's 30s budget for a wide range. Rather than make the interactive path
 * carry that, EventBridge runs this out of band so the S3 cache is already warm
 * for the dates anyone actually looks at.
 *
 * It writes through exactly the same code paths the API uses, so there is no
 * second definition of what "warm" means.
 */

interface WarmEvent {
  mode?: 'live' | 'backfill';
  /** How many days back `backfill` should cover, including today. */
  days?: number;
}

/** The `n` most recent dates ending on today's baseball day (see etDate.ts),
 *  oldest first — so between midnight and 3am ET the warmer keeps refreshing
 *  the slate that's still finishing rather than the empty next one. */
function recentDates(n: number): string[] {
  const [y, m, d] = baseballToday().split('-').map(Number);
  const today = Date.UTC(y, m - 1, d);
  return Array.from({ length: n }, (_, i) =>
    new Date(today - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

async function warmDays(dates: string[]): Promise<void> {
  for (const date of dates) {
    try {
      // No filter: the warmer wants the whole day cached, and a finished day is
      // snapshotted as a side effect.
      const day = await getDay(date);
      console.log(`warmed ${date}: ${day.games.length} games, ${day.reports.size} players`);
    } catch (err) {
      console.error(`warming ${date} failed:`, err);
    }
  }
}

/**
 * Per-player season data. These are the caches with no natural warm path — a
 * pitcher's arsenal and a player's percentile card each come from their own
 * full-season fetch, so a cold container pays for them on the first request
 * that needs them.
 */
async function warmPlayers(): Promise<void> {
  const players = await getAllWatchedPlayers();
  if (players.length === 0) {
    console.log('no watched players to warm');
    return;
  }
  const batterIds = players.filter((p) => p.kind === 'batter').map((p) => p.id);
  const pitcherIds = players.filter((p) => p.kind === 'pitcher').map((p) => p.id);
  console.log(`warming ${batterIds.length} batters, ${pitcherIds.length} pitchers`);

  // These two are already batched into one upstream call each.
  await Promise.all([
    getPlayerStats(batterIds).catch((err) => console.error('player stats failed:', err)),
    getPitcherStats(pitcherIds).catch((err) => console.error('pitcher stats failed:', err)),
  ]);

  // A season CSV per pitcher, so keep the fan-out modest.
  await mapLimit(pitcherIds, 4, async (id) => {
    try {
      await getSeasonArsenal(id);
    } catch (err) {
      console.error(`arsenal warm failed for ${id}:`, err);
    }
  });

  await mapLimit(players, 4, async (p) => {
    try {
      await getPercentiles(p.id, undefined, p.kind);
    } catch (err) {
      console.error(`percentiles warm failed for ${p.id}:`, err);
    }
  });
}

export async function warm(event: WarmEvent = {}): Promise<{ mode: string; dates: string[] }> {
  const mode = event.mode ?? 'live';

  if (mode === 'backfill') {
    const dates = recentDates(Math.max(1, event.days ?? 7));
    await warmDays(dates);
    await warmPlayers();
    // The add-player search hits this on first load and it's a ~1,400-row fetch.
    await getSeasonPlayers(new Date().getFullYear()).catch((err) =>
      console.error('season roster warm failed:', err),
    );
    return { mode, dates };
  }

  // 'live': just today and yesterday — the dates the app actually opens on, and
  // the only ones that change minute to minute.
  const dates = recentDates(2);
  await warmDays(dates);
  return { mode, dates };
}

export const handler = async (event: WarmEvent = {}) => {
  const result = await warm(event);
  console.log('warm complete', result);
  return result;
};
