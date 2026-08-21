import { getDay } from './savant.js';
import { getSeasonArsenal } from './pitcherArsenal.js';
import { getPercentiles } from './percentiles.js';
import { getPitcherStats, getPlayerStats, getSeasonPlayers } from './mlbStats.js';
import { getResearch } from './research.js';
import { getTeamResearch } from './teamResearch.js';
import { warmTeamHitting } from './teamHitting.js';
import { RESEARCH_WINDOWS, TEAM_HITTING_WINDOWS } from './types.js';
import { getAllRosterPlayers } from './store.js';
import { mapLimit } from './limit.js';
import { baseballToday } from './etDate.js';
import { getRosterTrend } from './espn.js';
import { buildLeagueXwoba } from './leagueWoba.js';
import { warmXwobaSeries } from './xwoba.js';

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
  const players = await getAllRosterPlayers();
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

  // The rolling chart's per-PA season series. Another season CSV per player,
  // and the slowest read on the player page — 5.7 to 6.6 seconds when Savant
  // has no warm copy of the query, against 0.12 when it does.
  //
  // The route serves a stale copy and refreshes behind it, so this is not what
  // stops a reader waiting; what it buys is that a rostered player's copy is
  // never older than last night, which is the window that rule serves stale
  // inside. Past a day it blocks, and this is what keeps anybody from getting
  // there. `warmXwobaSeries` rather than the reader's own door, which would
  // answer from the stale copy and leave the refresh running into a frozen
  // container — see the note on it.
  await mapLimit(players, 4, async (p) => {
    try {
      await warmXwobaSeries(p.id, p.kind);
    } catch (err) {
      console.error(`xwOBA series warm failed for ${p.id}:`, err);
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
    // The research board: a league-wide MLB leaderboard plus three Savant CSVs
    // per kind, and the one page in the app that belongs to nobody's watchlist
    // — so nothing else here would ever pull it warm.
    //
    // Every window too, not just the season. A window's Statcast half is built
    // from the per-date exports (see `statcastWindow.ts`), and while a day's
    // counts are cached forever once computed, the *first* pass over a 60-day
    // window has up to sixty 3.3MB CSVs to fetch — far past what the
    // interactive path can absorb. After that each night adds one new day and
    // re-reads the rest as small blobs, so this stays cheap. Sequential by
    // window so the cold first run doesn't open sixty downloads per board at
    // once; the boards within a window still go together.
    for (const window of RESEARCH_WINDOWS) {
      await Promise.all(
        (['batter', 'pitcher'] as const).map((kind) =>
          getResearch(kind, window).catch((err) =>
            console.error(`research ${kind} ${window} warm failed:`, err),
          ),
        ),
      );
    }
    // The same board read as thirty clubs. It rides here rather than in a loop
    // of its own because it is the *same* per-day blobs underneath — the club
    // axes are tallied in the same pass as the player ones — so by this point
    // every window but the season's is a handful of `Map` additions. The season
    // one still reduces ~170 days, which is why it is here at all and not on a
    // reader's critical path. Sequential by window, for the reason above.
    for (const window of RESEARCH_WINDOWS) {
      await Promise.all(
        (['batter', 'pitcher'] as const).map((kind) =>
          getTeamResearch(kind, window).catch((err) =>
            console.error(`team research ${kind} ${window} warm failed:`, err),
          ),
        ),
      );
    }
    // The opponent table's boards: how every team has hit over each of the same
    // five windows, whole, at home, on the road and against each hand. Same
    // shape as the research board above and the same reason to be here — it is
    // built by summing the per-date exports, so the *first* pass over the
    // season has up to 167 days to reduce, which is 12 seconds on a warm cache
    // and far more on a cold one. Every day it touches is a blob for ever
    // after, and the boards themselves are the ones `/api/report` reads for
    // every opponent a watched pitcher has, so a reader must never be the one
    // paying for a cold build. Sequential for the reason the boards above are.
    for (const window of TEAM_HITTING_WINDOWS) {
      await warmTeamHitting(window).catch((err) =>
        console.error(`team hitting ${window} warm failed:`, err),
      );
    }
    // ESPN ownership: one 940KB request whose *point* here is the side effect —
    // it writes the day's snapshot, which is the baseline every future trend is
    // measured against. Nothing else guarantees a snapshot on a day nobody
    // happens to open the research board, and a missing day is a gap in the
    // history for the `TREND_MAX_DAYS` (35) it stays inside the longest window.
    //
    // A missed night costs more than it used to, and unevenly: the columns each
    // have only their own narrow drift to route around a hole (none at all on
    // 1D), so one skipped day takes the 1D column out entirely the following
    // morning while the 30D one never notices. Nothing prunes these blobs, so
    // the history is exactly the set of days this ran on.
    await getRosterTrend().catch((err) =>
      console.error('ESPN ownership snapshot failed:', err),
    );
    // The rolling chart's reference line: what an average plate appearance has
    // been worth this season, summed from the same per-date exports the two
    // boards above are built from. **The read path never builds this** — a
    // chart opening must not be the thing that reduces 142 days of Statcast —
    // so if this does not run the client falls back to the old fixed .315 and
    // says so in the legend.
    //
    // Cheap after the first night: each day's two numbers are stored as they
    // are computed, so a run that dies half way leaves its work behind and the
    // next one has a single new day to add.
    await buildLeagueXwoba()
      .then((l) =>
        console.log(`league xwOBA ${l.xwoba} over ${l.pa} PA, ${l.days} days through ${l.through}`),
      )
      .catch((err) => console.error('league xwOBA build failed:', err));
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
