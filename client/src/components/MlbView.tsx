import { PaneBusy } from './Loading';
import type { MlbScoreboard, MlbStandings } from '../types';
import type { DatePreset } from './DateControls';
import MlbScoreboardTab from './MlbScoreboard';
import MlbStandingsTab from './MlbStandings';
import type { StandingsGroup } from './MlbStandings';

/**
 * The MLB view — the one page in this app that is about **baseball** rather
 * than about a roster or a fantasy league.
 *
 * **Two tabs, because they are two questions:**
 *
 *  1. **Scoreboard** — every game on one day, each a door into its own page.
 *     *What happened.*
 *  2. **Standings** — where the thirty clubs are, and how they have been going.
 *     *Who is any good.*
 *
 * **There were three**, and the third was `News` — the league's ten biggest
 * stories, ranked on the server. It is gone, and the reasoning it was added
 * under is the reasoning that removed it: a league-wide feed is the *least*
 * personal thing this app draws, and the news a reader of this app actually
 * acts on is the news about **his own players**, which the roster's news mark
 * and the player page's News tab already put in front of him at the moment he
 * is looking at that man. The tab was a second, worse place to find a subset of
 * the same sweep. `recentNews.ts` is untouched and still answers both of those.
 *
 * **It is last in the main tab row and it is drawn for everybody.** Last
 * because the order of that row is how close a page is to the reader — his
 * matchup, his players, the players he might want, his league, and then the
 * league everybody is in. Drawn always because, alone among the five, it needs
 * nothing of the reader: no watchlist, no fantasy league, no connection. A
 * reader who has just signed up and watched nobody has a page that works, which
 * is the one thing this app did not have before.
 *
 * **Which tab is open is in the URL** (`mlb=`), because it decides what data is
 * on screen — the rule `view=`, `lt=` and `win=` all follow. The Scoreboard is
 * the default and is omitted, so a bare `?view=mlb` opens where the page
 * opens.
 *
 * **Each tab's data is read on its first open and kept**, the way the League
 * page's three are and the player page's nine are; the Scoreboard re-reads when
 * the day changes and while it holds a game that is being played, which is the
 * only thing on this page that moves by the minute. See `App.tsx`.
 */

export type MlbTab = 'scoreboard' | 'standings';

/** The two pages of the MLB view.
 *
 * **Exported, because the strip that draws them is not this component's** —
 * the app already has a row for exactly this statement (`.view-tools`, which
 * holds the League page's own three), and a second strip of tabs an inch under
 * the first reads as a different kind of control rather than as one tier down
 * of the same one. `App` draws it there and this file keeps the vocabulary. */
export const MLB_TABS: { tab: MlbTab; label: string; title: string }[] = [
  { tab: 'scoreboard', label: 'Scoreboard', title: "One day’s games, and a door into each" },
  { tab: 'standings', label: 'Standings', title: 'Where the thirty clubs stand' },
];

export default function MlbView({
  tab,
  board,
  boardDate,
  boardPreset,
  onBoardDate,
  boardPresets,
  maxDate,
  calendarOpen,
  onToggleCalendar,
  onCloseCalendar,
  boardLoading,
  boardBusy,
  boardError,
  onOpenGame,
  standings,
  group,
  onGroup,
  standingsLoading,
  standingsError,
  onOpenTeam,
}: {
  tab: MlbTab;
  board: MlbScoreboard | null;
  boardDate: string;
  boardPreset: string | null;
  onBoardDate: (date: string, preset: string | null) => void;
  boardPresets: DatePreset[];
  maxDate: string;
  calendarOpen: boolean;
  onToggleCalendar: () => void;
  onCloseCalendar: () => void;
  boardLoading: boolean;
  /** The same read over a board that is already drawn — stepping the date bar
   *  on a day the app has not cached. `boardLoading` is press-triggered by
   *  construction (the poll passes `refresh` and deliberately raises nothing),
   *  so this can carry a mark without the poll strobing it. */
  boardBusy: boolean;
  boardError: string | null;
  onOpenGame: (gamePk: number) => void;
  standings: MlbStandings | null;
  group: StandingsGroup;
  onGroup: (group: StandingsGroup) => void;
  standingsLoading: boolean;
  standingsError: string | null;
  onOpenTeam: (teamId: number) => void;
}) {
  return (
    <div className="mlb-view">
      {tab === 'standings' ? (
        <MlbStandingsTab
          data={standings}
          group={group}
          onGroup={onGroup}
          loading={standingsLoading}
          error={standingsError}
          onOpenTeam={onOpenTeam}
        />
      ) : (
        <MlbScoreboardTab
          board={board}
          date={boardDate}
          preset={boardPreset}
          onDate={onBoardDate}
          presets={boardPresets}
          maxDate={maxDate}
          open={calendarOpen}
          onToggleCalendar={onToggleCalendar}
          onCloseCalendar={onCloseCalendar}
          loading={boardLoading}
          error={boardError}
          onOpenGame={onOpenGame}
        />
      )}
      {/* Over the games already on screen: yesterday's slate is still the true
          answer until today's lands. */}
      <PaneBusy busy={boardBusy}>Reading the day&rsquo;s games</PaneBusy>
    </div>
  );
}
