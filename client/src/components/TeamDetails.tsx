import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useResource } from '../resource';
import {
  fmt,
  formatStartTime,
  inningLabel,
  prettyGameDate,
  SEASON_STALE_MS,
  surname,
  teamColor,
  teamLogoUrl,
} from '../lib';
import { RecentNewsContext, useDelayedFlag, useGameDoor } from '../hooks';
import type { GameDoor, TeamPageTab } from '../hooks';
import { DetailsShell, DetailsTabButton } from './DetailsShell';
import { LoadingBlock, LoadingLine, PaneBusy } from './Loading';
import { ErrorLine } from './ErrorLine';
import { OpponentSection } from './OpponentTable';
import { ParkTable } from './ParkFactors';
import { PlayerWindowTable } from './PlayerWindowTable';
import { buildScheduleIndex, gamesOn, OpponentPress, opponentText, spanPhrase } from './schedule';
import type { PitcherLookup } from './schedule';
import type {
  PlayerKind,
  RecentNews,
  ResearchRow,
  ScheduleGame,
  ScheduleWindow,
  SeasonPlayer,
  TeamGameResult,
  TeamInfo,
} from '../types';
import { SlidingTabs } from './TabSlider';

/**
 * **A club's page**, and the second thing in this app to be one.
 *
 * It is the player page's twin by construction rather than by resemblance: the
 * box, the pinned chrome, the back button, the tab strip, the scroll reset and
 * the Escape are `DetailsShell`, which was extracted from `PlayerDetails` the
 * day this file was written and which both are now drawn on. What is here is
 * only what is different about reading *thirty men at once*.
 *
 * ## Where it is reached from, and why those three
 *
 * The research board's **team reading**, whose rows were the one identity block
 * in the app drawn as plain text — `is-static`, with a comment saying "there
 * being no club page behind it". There is one now, so the name and the cap
 * logo are links, exactly as a player row's are.
 *
 * A **player's Overview**, which knows his club (`report.teamId`) and until now
 * had nowhere to send a reader who wanted it. This is the commonest route: you
 * are reading a man, you want to know what his lineup looks like around him.
 *
 * The **header search**, which is the app's one way of reaching a subject by
 * typing its name, and a club is a subject one can now open.
 *
 * ## What a club's page is *not*
 *
 * Every per-player mark is gone and each for the reason the board's team rows
 * already give: the roster baseball and the padlock say who owns him, which no
 * fantasy league can say of the Brewers; the watchlist star adds a
 * `${kind}-${id}` key to a list of players; the lineup pip is a batting order
 * and the status code an injury designation. Each of them would be a mark on
 * every club or on none.
 *
 * The **Percentile Rankings**, **Splits**, **News**, **Game Log** and
 * **Charts** tabs are absent, and none of them is an omission:
 *
 * - Savant publishes percentile bars and a rolling xwOBA series **per player**;
 *   there is no club scrape behind either, and inventing one from the team
 *   board would be this app's own ranking wearing Savant's clothes.
 * - A club's platoon reading is the **Splits** tab, which is nine cuts rather
 *   than two, on **either side of the ball**, and is the same `OpponentSection`
 *   a pitcher's opponent draws. A `PlatoonSplits` bar beside it would be the
 *   same fact at lower resolution.
 * - A club's news is thirty men's news, which is the app's `recentNews` map
 *   already drawn where it belongs — beside each of their names.
 * - A club's game log is its schedule with scores in it, and the scores are not
 *   on the wire (`ScheduleGame` is deliberately thin — see `types.ts`).
 *
 * So five tabs, and each of them answers a question a *club* is opened with.
 */
/** The five, written in strip order for the same reason `DetailsTab`'s union is:
 *  a tab is a key and never an index, so the strip's order is the order the
 *  buttons are written in and nothing anywhere stores a position.
 *
 *  **It is not in the URL**, which is the player page's own call and made for
 *  the same reason: a tab is which reading of one subject is on screen, where
 *  `team=` and `tside=` are which subject and which of its two halves. A link
 *  carrying the tab as well would describe a scroll position of the page rather
 *  than the page. */
/** The tab union lives in `hooks.ts` — see `TeamPageTab`, which the team door
 *  names one of. Aliased here so this file reads in its own vocabulary. */
type TeamTab = TeamPageTab;

/** How many days of fixtures the Schedule tab draws, and the preview's five.
 *  The player page's own `HORIZON` — one fortnight means one thing in this
 *  app, whether the rows are a man's or his club's. */
const HORIZON = 14;
const PREVIEW = 5;

/**
 * The cap mark at the head of the page, on the club's own color — the same
 * picture, the same rule and the same fallback as the board's row logo
 * (`TeamPhoto`), at the size the player page's portrait takes.
 *
 * Not `TeamPhoto` itself: that one is a **table cell's** box, and carries the
 * `line-height: 0` wrapper that keeps a row at 58px. A page header is not a
 * row, which is the same distinction `DetailsPhoto` makes against the summary
 * table's 42px circle one file over.
 */
function TeamCrest({ teamId, name, abbr }: { teamId: number; name: string; abbr: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="details-photo-wrap">
      {failed ? (
        <span
          className="details-photo details-crest details-crest-none"
          style={{ background: teamColor(teamId) }}
          title={name}
        >
          {abbr || '—'}
        </span>
      ) : (
        <img
          className="details-photo details-crest"
          src={teamLogoUrl(teamId)}
          /* The club's own ground under an `on-dark` cut — thirteen of the
             thirty are drawn in white alone and vanish on a light theme. See
             `lib.ts::teamColor`, which carries the contrast measurements. */
          style={{ background: teamColor(teamId) }}
          alt={name}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export function TeamDetails({
  team,
  side,
  onSideChange,
  players,
  playersLoading,
  scheduleWindow,
  scheduleError,
  onNeedSchedule,
  pitcherLookup,
  onOpenDetails,
  onClose,
  statsColumns,
  onStatsColumnsChange,
  showRanks,
  onShowRanksChange,
  rankPopulations,
  onNeedRankPopulations,
  initialTab,
  onTabChange,
}: {
  team: TeamInfo;
  /**
   * **Which side of the ball the page is reading** — the club's bat or its
   * arms, and the same division the whole app is built on (`PlayerKind`, the
   * board's Batters/Pitchers pills, the roster's two tables).
   *
   * A club is the one subject in this app that is genuinely *both*, which is
   * why this is a control in the chrome rather than a fact about which page you
   * opened. It rides in the URL (`tside=`) because it decides which numbers the
   * Stats and Overview tabs are showing — the rule that put `pos=` and `win=`
   * there — and is held by `App` for the reason the Stats tab's columns are:
   * this component is unmounted every time the page closes.
   */
  side: PlayerKind;
  onSideChange: (side: PlayerKind) => void;
  /** The season roster the client holds from boot, which is where the **Roster**
   *  tab's rows come from. Handed down rather than fetched: it is one list for
   *  the whole app and the header search is already holding it. */
  players: SeasonPlayer[];
  playersLoading: boolean;
  /** The league-wide schedule window, asked for exactly as the player page's
   *  Schedule tab asks for it — it takes no parameters, `App` holds one for the
   *  session, and this is the fourth surface to want it. */
  scheduleWindow: ScheduleWindow | null;
  scheduleError: string | null;
  onNeedSchedule: () => void;
  pitcherLookup: PitcherLookup;
  /** Open a player's page from a roster row or a fixture's announced starter.
   *  The same `${kind}-${id}` key every other route into that page uses. */
  onOpenDetails: (key: string) => void;
  onClose: () => void;
  /** The Stats tab's saved column set — **the player page's own**, deliberately.
   *  It is one vocabulary and one table, and a reader who has chosen their
   *  columns has chosen them for the way they read a stat line, not for the
   *  kind of subject it belongs to. */
  statsColumns: string[] | null;
  onStatsColumnsChange: (keys: string[] | null) => void;
  showRanks: boolean;
  onShowRanksChange: (on: boolean) => void;
  /** The **team** boards per window — thirty clubs, which is the only
   *  population a club's percentile means anything against. See
   *  `App::teamRankPopulations`. */
  rankPopulations: Partial<Record<string, ResearchRow[]>>;
  onNeedRankPopulations: () => void;
  /** Which tab to open on. Absent means Overview, which is every door but the
   *  park strip's. Read once, at mount — a page already open does not jump
   *  under the reader because something re-rendered. */
  initialTab?: TeamPageTab;
  /** **Which tab is showing**, reported upwards for one caller: a game opened
   *  from this page remembers the tab it was opened from, so its `Back` returns
   *  the reader to the list they pressed a row of. Not the same thing as
   *  `initialTab`, which is the tab a *door* named — see the effect below. */
  onTabChange?: (tab: TeamPageTab) => void;
}) {
  /** **The tab the page opens on.** `overview` unless a door named one — the
   *  park strip on a game preview opens straight onto `park`, that being the
   *  reading its reader pressed the venue's name to get. */
  const [tab, setTab] = useState<TeamTab>(initialTab ?? 'overview');
  /**
   * **Which tab is showing, told upwards** — for one caller and one purpose: a
   * game opened from this page remembers the club *and the tab*, so `Back` from
   * that game returns the reader to the list they pressed a row of rather than
   * to the Overview.
   *
   * It has to be reported rather than read, because the tab is deliberately
   * **not** in the URL and deliberately **not** App's state: `initialTab` is the
   * tab a *door* named, and App keys this page on it, so making that state
   * follow the strip would remount the page on every press of it. This is the
   * one fact App needs and it goes into a ref, not into the key.
   */
  useEffect(() => {
    onTabChange?.(tab);
  }, [tab, onTabChange]);
  /** The door onto a game's page, which two tabs on this page hand out — every
   *  row of `Results`, and every fixture on `Schedule` and the Overview. Read
   *  off the context for the reason that context exists: the rows are leaves. */
  const gameDoor = useGameDoor();

  /**
   * **The club's row on all five spans**, read once per club and side and shared
   * by two tabs — the Stats table draws all five, the Overview draws the season
   * one as a strip and the record beside the name comes off it too.
   *
   * The player page's own economy (`news`, `gameLog`, `starts` are each read
   * once and handed to the Overview and to their own tab), and for the same
   * reason: two reads of one thing are two chances for the page to say two
   * things.
   *
   * **Not lazy per tab**, where every read on the player page is. The Overview
   * *is* the default tab and it draws this, so laziness would buy nothing and
   * cost the strip a wait on the tab that opens.
   */
  /**
   * **Keyed by club and side**, which is what the `windowsReq` ref spelled and
   * what the store now holds the answer under. The ref carried a paragraph
   * about never being marked before the answer lands — the StrictMode hang the
   * whole app has met four times — and a key cannot be marked at all: a read is
   * decided by the entry's own state, and only the newest may write it.
   *
   * Not lazy, and that is argued above: the Overview *is* the default tab and
   * it draws this, so laziness would buy nothing and cost the strip a wait on
   * the tab that opens.
   */
  const windowsRes = useResource(
    `teamWindows:${team.id}:${side}`,
    () => api.teamWindows(team.id, side),
    { keepPrevious: false, staleMs: SEASON_STALE_MS },
  );
  const windows = windowsRes.value ?? null;
  const windowsError = windowsRes.error?.message ?? null;
  const windowsLoading = windowsRes.loading;
  /** The same pair as the player page's Stats tab, and the same reason: a side
   *  switch is familied, so it carries the previous side's rows and reports
   *  `updating` rather than `loading` while the next ones are read. */
  const windowsBusy = windowsRes.updating;

  /** The season row, which is what the head's record and the Overview's strip
   *  read. `null` until the read lands, and on a club that a board is missing. */
  const seasonRow = useMemo(
    () => windows?.windows.find((w) => String(w.window) === 'season')?.row ?? null,
    [windows],
  );

  /**
   * **The club's nine cuts on the side the page is reading** — the Splits tab,
   * lazy on first open of it, and keyed by club **and side** so a switch between
   * the two is a read of its own and never one side's numbers under the other's
   * heading.
   *
   * The venue and the span are *not* in the key, and that is the route's own
   * bargain: it answers with all three venues at once so that changing that
   * control costs nothing, and `OpponentBody` reads the other four spans itself
   * (keyed by side there too).
   */
  const splitsRes = useResource(
    tab === 'splits' ? `teamSplits:${team.id}:${side}` : null,
    () => api.teamSplits(team.id, 'season', side === 'pitcher' ? 'pitching' : 'batting'),
    { keepPrevious: false, staleMs: SEASON_STALE_MS },
  );
  const splits = splitsRes.value ?? null;
  const splitsError = splitsRes.error != null;
  /* A flag off the store rather than off a ref, and the difference is one the
     app's loading rules make explicit: a ref is not reactive, so a wait tested
     against it is tested on a render that has already happened. This is state,
     and it moves the render that starts the read and the render the answer
     lands on. */
  const splitsLoading = splitsRes.loading;
  /* Rule 2 of the loading system: a block wait only where there is nothing to
     show yet, and only past `WAIT_DELAY` — a club already read comes back in a
     tick, and a wait that flashes reads as the page breaking. */
  const splitsWait = useDelayedFlag(splitsLoading);

  /** The board this club's percentiles are ranked in is the **team** board, and
   *  the tab asks for it the way the player page's does — through App, which
   *  owns the cache the research view fills. */
  const needRanks = useCallback(() => onNeedRankPopulations(), [onNeedRankPopulations]);

  const record = seasonRow?.record ?? null;

  return (
    <DetailsShell
      tab={tab}
      /* A different club is a different page; the side is a reading *of* one,
         so it is deliberately not in this key — switching bat for arm keeps the
         reader where they were on a five-row table. */
      resetKey={team.id}
      onClose={onClose}
      tabsLabel="Team sections"
      head={
        <div className="details-id">
          <TeamCrest teamId={team.id} name={team.name} abbr={team.abbreviation} />
          <div>
            <h1 className="details-name">{team.name}</h1>
            <div className="details-sub">
              {/* The abbreviation is what every table in the app calls this club,
                  so the page that names it in full says the short form too —
                  otherwise a reader arriving from a `MIL` cell has to take on
                  faith that this is the same club. It takes the position chip's
                  slot and its shape, being the same kind of fact: what this
                  subject *is*, in the app's own words. */}
              <span className="player-pos" title={`${team.name} — ${team.abbreviation}`}>
                {team.abbreviation}
              </span>
              {/* **The record, where a player's hand goes**, and it is the same
                  substitution the board's team rows make: a club has no hand to
                  hit from, and its won-lost is the one fact about it that reads
                  like an identity rather than a statistic. Span-matched to the
                  season, which is what the head is about; the windowed records
                  are on the Stats tab's rows, each beside its own span. */}
              {record && (
                <span className="team-record" title={`${team.name} are ${record.wins}-${record.losses} this season`}>
                  {record.wins}-{record.losses}
                </span>
              )}
            </div>
          </div>
        </div>
      }
      chromeExtra={
        /* **The side switch, on the player page's own row and in its own
           classes** (`.details-kind-row`, `view-switch`) — the two controls are
           the same control: *which half of this subject am I reading*. What
           differs is only how far a press reaches. On a player it changes the
           subject — a two-way man is two pages under one id, so his tab resets
           and every read on his page re-keys; here nothing resets, because a
           club is always both halves at once and nobody would call the Brewers'
           pitching a different club.

           **Neither of them is a page opened over the page**, and that half
           used to differ too: this said the player's switch was *navigation*
           where this one was a reading, and his went through `openPlayer` on
           that reading and put a step on the route stack — three presses of
           `Back` to leave a page a reader had crossed it twice on. It presses
           `crossKind` now, which writes `player=` and leaves the stack alone.
           The distinction this paragraph draws is real; what it does not decide
           is what `Back` means. */
        <div className="details-kind-row">
          <SlidingTabs className="view-switch" label="Which side of the ball">
            {(['batter', 'pitcher'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                className={`view-tab${side === k ? ' active' : ''}`}
                aria-selected={side === k}
                onClick={() => onSideChange(k)}
                title={
                  k === 'batter'
                    ? `${team.name} at the plate`
                    : `${team.name} on the mound`
                }
              >
                {k === 'batter' ? 'Batting' : 'Pitching'}
              </button>
            ))}
          </SlidingTabs>
        </div>
      }
      tabs={
        <>
          {/* First and default: what the club is doing now and what it has done
              this season, which is the pair of questions a page like this is
              opened with. */}
          <DetailsTabButton id="overview" tab={tab} onPick={setTab}>
            Overview
          </DetailsTabButton>
          {/* The forward half of that pair at its full length, in the place the
              player page keeps its own: after the reading it previews. */}
          <DetailsTabButton id="schedule" tab={tab} onPick={setTab}>
            Schedule
          </DetailsTabButton>
          {/* **`Results` is `Schedule` read the other way** — what the club has
              played, newest first, with the score in it — and the two are the
              page's one pair of tabs that answer the same kind of question
              about different halves of the season.

              **This is the tab the page's own document said could not exist.**
              It refused a game log on the grounds that *"a club's game log is
              its schedule with the scores in it, and the scores are not on the
              wire"* — `ScheduleGame` being deliberately thin, that window
              being the forward one. They are on the wire now, on a route of
              this tab's own (`/api/teams/:id/games`), and what changed the
              bargain is that every row is a **door**: a game has a page, so a
              list of games is a list of doors rather than a table of numbers
              that would have to grow to be worth the trip.

              It sits directly behind `Schedule` because the two are one
              reading split at today, and ahead of `Roster` because a club is
              opened for what it has been doing before it is opened for who is
              on it. */}
          <DetailsTabButton id="results" tab={tab} onPick={setTab}>
            Results
          </DetailsTabButton>
          {/* **Roster is a club's own tab and has no player-page twin**, which is
              the whole of what makes this page worth having: it is the one place
              in the app that answers "who plays for them", and every row of it
              is a door to the page a reader came from. */}
          <DetailsTabButton id="roster" tab={tab} onPick={setTab}>
            Roster
          </DetailsTabButton>
          {/* **`Splits`, where this read `Hitting`.** The strip names the *kind*
              of reading a tab holds — Overview, Schedule, Roster, Stats — and
              `Hitting` named its content instead, which is the fault the player
              page's own strip corrected when `Rolling xwOBA` became `Charts`.
              It also stopped being true the moment the tab began following the
              side switch: on `Pitching` it is the club in the field, and a tab
              headed `Hitting` over a table of runs *allowed* lies about what is
              under it. What is invariant is that the table is a **split** — by
              the other man's hand and by the ballpark — and that is what the
              strip says now; the table's own heading names the side.

              It sits before Stats for the reason the player page runs pictures
              before numbers: a split is a comparison, where Stats is the
              record. */}
          <DetailsTabButton id="splits" tab={tab} onPick={setTab}>
            Splits
          </DetailsTabButton>
          {/* **`Park` is a fact about the club's ground rather than about the
              club**, and it is on this page because a ballpark has no page of
              its own and nobody looks for one: a reader asking what Coors does
              to a hitter is on the Rockies' page already.

              It sits after Splits and before Stats for the reason Splits sits
              before Stats: a park factor is a **comparison** — every number on
              it is against the average park — where the Stats tab is the
              club's record. And it is a tab rather than a block on Overview
              because it is sixteen indexes on each of three hands, which is
              more than a tab argued to be short can hold.

              It is the one tab that does **not** follow the side switch, and
              that is a fact about parks rather than an omission: a park does
              the same thing to both clubs standing in it, so `Pitching` could
              only mean the same numbers under a different heading. The cut a
              park factor genuinely has is *which hitter*, and that switch is
              inside the tab. */}
          <DetailsTabButton id="park" tab={tab} onPick={setTab}>
            Park
          </DetailsTabButton>
          <DetailsTabButton id="stats" tab={tab} onPick={setTab}>
            Stats
          </DetailsTabButton>
        </>
      }
    >
      {/* **The Overview reads forwards, then back, then sideways** — the club's
          next game, the run after it, the games just played, what has been said
          about them, and the season line last.

          It was the season line *first* and the fixtures under it, which is the
          order a *reference* page is built in: the summary, then the detail. A
          club page is not opened as a reference. It is opened on a game day
          with one question — *who are they playing and how is it going* — and
          the answer to that was the second block, under a table of season
          totals that will read the same tomorrow.

          So the order is by **how soon it moves**: the next game (or the one
          being played right now) is the fastest-moving thing on the page and
          leads; then the fixtures behind it; then the results, which stopped
          moving a few hours ago; then the news, which reaches back two days;
          then the season, which is a fact about four months and is where a
          reader goes on purpose. Every block but the news carries a door onto
          the tab that holds the whole of it, which is what keeps a preview a
          preview. */}
      {tab === 'overview' && (
        <div className="details-overview">
          {/* **The next game on its own, and the same list the block under it
              slices.** `skip` is what makes that one list rather than two: a
              second component would sort a doubleheader by its own rule sooner
              or later, and this page has already had to write that rule down
              once (see `TeamGames`, where the nightcap arrives first). A game
              being played *now* is the head of the same list — the window opens
              on today — so `Next Game` says `Live` on its own row without this
              block having to know what live is. */}
          <TeamGames
            team={team}
            scheduleWindow={scheduleWindow}
            scheduleError={scheduleError}
            onNeedSchedule={onNeedSchedule}
            pitcherLookup={pitcherLookup}
            onOpenDetails={onOpenDetails}
            onOpenGame={gameDoor}
            limit={1}
            heading="Next Game"
          />
          <TeamGames
            team={team}
            scheduleWindow={scheduleWindow}
            scheduleError={scheduleError}
            onNeedSchedule={onNeedSchedule}
            pitcherLookup={pitcherLookup}
            onOpenDetails={onOpenDetails}
            onOpenGame={gameDoor}
            skip={1}
            limit={PREVIEW}
            onSeeAll={() => setTab('schedule')}
          />
          <TeamResults
            team={team}
            onOpenGame={gameDoor}
            limit={PREVIEW}
            onSeeAll={() => setTab('results')}
          />
          <TeamNews team={team} players={players} onOpenDetails={onOpenDetails} />
          <TeamSeasonBlock
            team={team}
            side={side}
            row={seasonRow}
            loading={windowsLoading}
            error={windowsError}
            onSeeAll={() => setTab('stats')}
          />
        </div>
      )}

      {tab === 'schedule' && (
        <div className="details-overview">
          <TeamGames
            team={team}
            scheduleWindow={scheduleWindow}
            scheduleError={scheduleError}
            onNeedSchedule={onNeedSchedule}
            pitcherLookup={pitcherLookup}
            onOpenDetails={onOpenDetails}
            onOpenGame={gameDoor}
          />
        </div>
      )}

      {tab === 'results' && <TeamResults team={team} onOpenGame={gameDoor} />}

      {tab === 'roster' && (
        <TeamRoster
          team={team}
          side={side}
          players={players}
          loading={playersLoading}
          onOpenDetails={onOpenDetails}
        />
      )}

      {tab === 'splits' && (
        <div className="details-overview">
          {splits ? (
            /* The same nine cuts a pitcher's opponent table draws, drawn by the
               same component — see `OpponentTable.tsx`, which records why the
               alternative (a second, thinner club table) is exactly the drift
               this codebase spends its comments avoiding. `hand` is null: that
               argument accents the row for the man on the mound, and there is
               no one man here. */
            <OpponentSection
              hitting={splits}
              opponent={team.abbreviation}
              hand={null}
              side={side === 'pitcher' ? 'pitching' : 'batting'}
              /* **The heading names the side, where the tab names the kind of
                 reading.** `Opponent` is what every other caller means and would
                 be flatly false here — a club is not its own opponent — and
                 `Splits` is already on the tab above it, so the one thing left
                 for this line to say is which half of the club's season the
                 three rows are. */
              title={side === 'pitcher' ? 'Pitching' : 'Hitting'}
            />
          ) : splitsError ? (
            <ErrorLine>Couldn’t read {team.name}’s splits</ErrorLine>
          ) : splitsWait ? (
            <LoadingBlock>Reading {team.name}&rsquo;s splits</LoadingBlock>
          ) : splitsLoading ? null : (
            /* The server's honest "no board for that club" — a `null` answer
               rather than a failed read, which is a different fact and gets a
               different sentence. */
            <p className="ovw-none">
              No {side === 'pitcher' ? 'pitching' : 'hitting'} splits for {team.name}.
            </p>
          )}
        </div>
      )}

      {tab === 'park' && (
        <div className="details-overview">
          <ParkTable teamId={team.id} teamName={team.name} />
        </div>
      )}

      {tab === 'stats' && windows && (
        <PlayerWindowTable
          kind={side}
          teams
          windows={windows.windows}
          columnKeys={statsColumns}
          onColumnsChange={onStatsColumnsChange}
          showRanks={showRanks}
          onShowRanksChange={onShowRanksChange}
          populations={rankPopulations}
          onNeedPopulations={needRanks}
          updating={windowsBusy}
        />
      )}
      {/* The side switch carries the previous side's rows, so this is the
          `updating` half of the pair — the same statement the player page's
          Stats tab makes, from the same component. */}
      {tab === 'stats' && windows && (
        <PaneBusy busy={windowsBusy}>Reading {team.name}&rsquo;s board</PaneBusy>
      )}
      {tab === 'stats' && !windows && windowsLoading && (
        <LoadingBlock>Reading {team.name}&rsquo;s board</LoadingBlock>
      )}
      {tab === 'stats' && !windows && windowsError && (
        <ErrorLine detail={windowsError}>Couldn’t read {team.name}’s board</ErrorLine>
      )}
    </DetailsShell>
  );
}

/**
 * The club's season line, as the one-row table the player page's own Season
 * block draws — `.glog-table`, the app's one plain stat table, at one row.
 *
 * Which numbers is the **side switch's** answer, and they are the research
 * board's own defaults for each kind rather than a set chosen here: a reader
 * who wants a different eight has the Stats tab's picker one door along, and a
 * third vocabulary of stat labels is the thing this app has spent its
 * `researchColumns` on not having.
 */
function TeamSeasonBlock({
  team,
  side,
  row,
  loading,
  error,
  onSeeAll,
}: {
  team: TeamInfo;
  side: PlayerKind;
  row: ResearchRow | null;
  loading: boolean;
  error: string | null;
  onSeeAll: () => void;
}) {
  const wait = useDelayedFlag(loading);
  const cells: [string, string][] | null =
    row === null
      ? null
      : side === 'pitcher'
        ? [
            ['G', fmt(row.games)],
            ['IP', row.inningsPitched ?? '—'],
            ['W-L', `${fmt(row.wins)}-${fmt(row.losses)}`],
            ['ERA', fmt(row.era, 2)],
            ['WHIP', fmt(row.whip, 2)],
            ['K/9', fmt(row.strikeoutsPer9, 1)],
            ['BB/9', fmt(row.walksPer9, 1)],
          ]
        : [
            ['G', fmt(row.games)],
            ['R', fmt(row.runs)],
            ['HR', fmt(row.hr)],
            ['SB', fmt(row.sb)],
            ['AVG', rate(row.avg)],
            ['OBP', rate(row.obp)],
            ['SLG', rate(row.slg)],
            ['OPS', rate(row.ops)],
          ];
  return (
    <section className="ovw-block">
      <div className="ovw-head-row">
        <h2 className="ovw-head">Season</h2>
        <button type="button" className="ovw-link" onClick={onSeeAll}>
          Stats →
        </button>
      </div>
      {cells ? (
        <div className="glog-scroll">
          <table className="glog-table ovw-table">
            <thead>
              <tr>
                {cells.map(([label]) => (
                  <th key={label} className="glog-num" scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {cells.map(([label, value]) => (
                  <td key={label} className="glog-num">
                    {value}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : wait ? (
        <LoadingLine>Reading the season line</LoadingLine>
      ) : loading ? null : (
        /* An empty state names its own cause, and there are two of them here —
           a read that failed and a board with no row for this club. The second
           is not a fact about the club's season, so it does not claim to be. */
        <p className="ovw-none">
          {error
            ? `Couldn’t read ${team.name}’s season line.`
            : `No ${side === 'pitcher' ? 'pitching' : 'batting'} line for ${team.name} on this season’s board.`}
        </p>
      )}
    </section>
  );
}

/** A rate the way the whole app prints one — `.xxx`, leading zero dropped. The
 *  board's own `fmt` does the rounding; this is the one presentation rule
 *  `lib.ts::formatRate` states and it is applied here rather than restated. */
function rate(n: number | null): string {
  return n === null ? '—' : fmt(n, 3).replace(/^0\./, '.');
}

/**
 * **The club's fixtures** — the preview on the Overview and the whole fortnight
 * on the Schedule tab, one component drawn twice exactly as `UpcomingGames` is
 * one file over.
 *
 * **It is not `UpcomingGames`**, and that is a judgment rather than an
 * oversight. That block's row is built around a *player*: whether this man is
 * the announced starter, which turn of the rotation it is, what tier of
 * certainty the projection has, and the opposing lineup he would face. Every
 * one of those is a fact about somebody standing in the game, and a club is not
 * standing in it. What a club's row wants instead is **both** announced
 * starters, which that row has no place for and no reason to grow one. Two
 * rows that answer two questions are two rows — the rule the codebase applies
 * in the other direction to `OpponentSection`, which *is* shared because both
 * its callers want the identical nine cuts.
 *
 * What is shared is everything underneath: `buildScheduleIndex`, `gamesOn` and
 * `spanPhrase` are the schedule's own vocabulary, so this list and the two wide
 * tables' Schedule view cannot disagree about which games are in a fortnight or
 * about what a postponement is.
 */
function TeamGames({
  team,
  scheduleWindow,
  scheduleError,
  onNeedSchedule,
  pitcherLookup,
  onOpenDetails,
  onOpenGame,
  limit,
  skip = 0,
  heading: headingProp,
  onSeeAll,
}: {
  team: TeamInfo;
  scheduleWindow: ScheduleWindow | null;
  scheduleError: string | null;
  onNeedSchedule: () => void;
  pitcherLookup: PitcherLookup;
  onOpenDetails: (key: string) => void;
  /** The game's own page, off the matchup in the middle of the row. */
  onOpenGame: GameDoor | null;
  limit?: number;
  /** **Rows to drop off the front**, which is what lets the Overview draw the
   *  next game on its own and the run after it beneath — one list, sliced twice,
   *  rather than a second component that would one day sort a doubleheader
   *  differently. */
  skip?: number;
  /** What the block is called, where the default derivation cannot say it: the
   *  Overview draws this component twice and the two blocks are `Next Game` and
   *  `Next Games`. */
  heading?: string;
  onSeeAll?: () => void;
}) {
  useEffect(() => {
    onNeedSchedule();
  }, [onNeedSchedule]);

  const index = useMemo(
    () => (scheduleWindow ? buildScheduleIndex(scheduleWindow, HORIZON, null, pitcherLookup) : null),
    [scheduleWindow, pitcherLookup],
  );

  const rows = useMemo(() => {
    if (!index) return [];
    const out: ScheduleGame[] = [];
    for (const date of index.dates) {
      const day = gamesOn(index, team.id, date);
      // A doubleheader is read *down* a list, so it is sorted by first pitch —
      // the grid stacks a day's two games in one cell where MLB's own game order
      // reads as "twice that day" either way up, and a list does not. Measured
      // on the live window: the Yankees' Aug 29 pair arrives nightcap-first. A
      // game nobody has posted a time for sorts last, the only place it can go.
      if (day.length > 1) {
        day.sort((a, b) => {
          if (a.startTime === b.startTime) return 0;
          if (a.startTime === null) return 1;
          if (b.startTime === null) return -1;
          return a.startTime < b.startTime ? -1 : 1;
        });
      }
      out.push(...day);
    }
    const from = out.slice(skip);
    return limit === undefined ? from : from.slice(0, limit);
  }, [index, team.id, limit, skip]);

  const loading = scheduleWindow === null && scheduleError === null;
  const wait = useDelayedFlag(loading);
  const heading = headingProp ?? (limit === undefined ? 'Schedule' : 'Next Games');

  if (index && rows.length > 0) {
    const phrase = spanPhrase(index);
    return (
      <section className={`ovw-block ovw-starts${onSeeAll ? ' ovw-upcoming' : ''}`}>
        <div className="ovw-head-row">
          <h2 className="ovw-head">{heading}</h2>
          {onSeeAll ? (
            <button type="button" className="ovw-link" onClick={onSeeAll}>
              Schedule →
            </button>
          ) : limit === undefined ? (
            /* **The span, on the whole-window list and nowhere else.** It says
               what the *list* covers, which is a fact about the window; on a
               block of one row it read `the next 14 days` over a single game,
               naming a span the block does not draw. */
            <span
              className="start-note"
              title={`Every game ${team.name} are scheduled to play ${phrase}. A postponement is not a game they get, so it is not here.`}
            >
              {phrase.replace(/^in /, '')}
            </span>
          ) : null}
        </div>
        <ol className="start-list">
          {rows.map((g) => (
            <TeamGameRow
              key={g.gamePk}
              game={g}
              teamId={team.id}
              pitcherLookup={pitcherLookup}
              onOpenDetails={onOpenDetails}
              onOpenGame={onOpenGame}
            />
          ))}
        </ol>
      </section>
    );
  }
  if (wait) return <LoadingBlock>Reading the schedule</LoadingBlock>;
  if (loading) return null;
  return (
    <section className="ovw-block ovw-starts">
      <div className="ovw-head-row">
        <h2 className="ovw-head">{heading}</h2>
      </div>
      {/* Three causes, three sentences — the read that failed, the window that
          came back and the club with nothing in it are three different facts,
          and one "nothing scheduled" would claim the third in all three cases. */}
      <p className="ovw-none">
        {scheduleError
          ? `Couldn’t read the schedule: ${scheduleError}`
          : index === null
            ? 'The schedule hasn’t been read yet.'
            : `${team.name} have no games scheduled in the next ${HORIZON} days.`}
      </p>
    </section>
  );
}

/**
 * One fixture: the day, the opponent, first pitch, and **both** announced
 * starters — the club's own and the other side's.
 *
 * Both, because on a club's page neither of them is "the other man": the reader
 * is looking at the matchup rather than at somebody in it. Each is a link where
 * the season roster can name him (`pitcherLookup`), which makes this list the
 * third route into a player's page from here after the Roster tab and the
 * Overview's own.
 *
 * **A name nobody has announced is drawn as nothing, not as `TBD`.** Clubs name
 * a starter about three days out — measured, 28/28 today, 27/30 tomorrow, 30/30
 * at two days and 3/22 at three — so past the front of the window the absence
 * is the schedule rather than a fact about the game, and a fortnight of `TBD`
 * would say the same non-thing eleven times.
 */
function TeamGameRow({
  game,
  teamId,
  pitcherLookup,
  onOpenDetails,
  onOpenGame,
}: {
  game: ScheduleGame;
  teamId: number;
  pitcherLookup: PitcherLookup;
  onOpenDetails: (key: string) => void;
  onOpenGame: GameDoor | null;
}) {
  const isHome = game.homeId === teamId;
  const mineId = isHome ? game.homeProbableId : game.awayProbableId;
  const theirsId = isHome ? game.awayProbableId : game.homeProbableId;
  const time = formatStartTime(game.startTime);
  const when = prettyGameDate(game.date);
  return (
    /* `.start-row` for the hairline between rows and `.start-line` for the
       wrapping sentence inside it — **folded onto the Projected Starts row
       rather than restyled to resemble it**, which is this stylesheet's own
       rule: that block draws exactly this kind of fact (a when, a matchup, a
       name) and two rules that agree today are two rules that will one day
       differ. The cells are its cells too, so a club's fixture and a pitcher's
       turn read alike wherever they are met. */
    <li className="start-row">
      <div className="start-line">
        <span className="ovw-next-when">
          {when}
          {time && game.state !== 'postponed' ? ` · ${time}` : ''}
        </span>
        {/* `vs SEA` / `@ SEA`, off the schedule's own wording so this row and
            the two wide tables' cells say a fixture the same way — and **the
            door onto the game's own page**, in `OpponentPress`'s own box, which
            is where every other opponent in this app is a press.

            A **postponement** is not a door: there is no game to read, and the
            row already says `PPD`. That is the same cut the summary table's
            cell makes, one state wide. */}
        <span className="ovw-next-opp">
          <OpponentPress
            onPress={onOpenGame && game.state !== 'postponed' ? () => onOpenGame(game.gamePk) : null}
            label={opponentText(game, teamId)}
            opens="page"
            title={`${game.away} at ${game.home} — the game’s page`}
          />
        </span>
        <span className="team-game-arms">
          <StarterName id={mineId} lookup={pitcherLookup} onOpen={onOpenDetails} />
          {/* **The `vs` belongs to the man on the right**, which is what makes
              all three states read: `Priester vs Sale` with both named, a bare
              `Priester` where only this club has named one, and `vs Sale` where
              only the other has — that last being the commonest of the three,
              since a reader on a club's page most often wants to know who *they*
              are facing. Hung off the pair instead, it left a line ending in a
              dangling "vs" whenever the far club had named nobody. */}
          {theirsId !== null && (
            <span className="ovw-next-vs" aria-hidden="true">
              vs
            </span>
          )}
          <StarterName id={theirsId} lookup={pitcherLookup} onOpen={onOpenDetails} />
        </span>
        {/* The one state worth a word here, and it takes the tag slot the
            Projected Starts row's `Announced` / `Projected` takes — the end of
            the line, in the app's fully-round label pill. A postponement is not
            a game they get: the count columns exclude it and the schedule cell
            says so, so a row that drew it silently would be a fixture that never
            happens sitting among ones that will. */}
        {game.state === 'postponed' && <span className="start-tag team-game-ppd">PPD</span>}
      </div>
    </li>
  );
}

/** An announced starter, as a link where the season roster can name him. A
 *  pitcher the list has forgotten is drawn as nothing rather than as a bare id:
 *  a name this app cannot produce is a page it cannot open either. */
function StarterName({
  id,
  lookup,
  onOpen,
}: {
  id: number | null;
  lookup: PitcherLookup;
  onOpen: (key: string) => void;
}) {
  const man = id === null ? undefined : lookup(id);
  // Nothing at all rather than a `TBD`: see the row above. An unannounced
  // starter past the front of the window is the schedule, not a fact about the
  // game, and a fortnight of placeholders says the same non-thing eleven times.
  if (id === null || !man) return null;
  return (
    <button
      type="button"
      className="team-game-arm"
      onClick={() => onOpen(`pitcher-${id}`)}
      title={`${man.name} — his page`}
    >
      {/* By **surname**, the rule the Projected Starts row states: this is a
          list of rows scanned down rather than one sentence read across, and
          two full names on a line would wrap it on a phone. The full name is on
          the row's own tooltip. */}
      {surname(man.name)}
    </button>
  );
}

/**
 * **The club's season, backwards** — every game it has played or is playing,
 * newest first, and every row a door onto that game's own page.
 *
 * ## What it is, against the tab beside it
 *
 * `Schedule` is the forward fortnight with both announced starters on it;
 * this is the season behind today with the **score** on it. They are one
 * reading split at the present moment, which is why they sit next to each
 * other in the strip, and they are two tabs rather than one list because they
 * are drawn from two different reads and answer two different questions — a
 * manager plans forwards and judges backwards.
 *
 * **Newest first**, and that is the whole of the ordering argument: a club's
 * page is opened to ask how they have been going, and the answer to that is at
 * the *end* of a season read the usual way up. The row a reader wants is the
 * first one.
 *
 * ## What a row says, and what it does not
 *
 * The day, the matchup, and a chip carrying the result — `W 5–3`, `L 2–7`, or
 * `Live 3-1` with the half-inning beside it. The chip is **`.glog-res`**, the
 * game log's own, folded onto rather than restyled: it is the same object (a
 * result beside an opponent) and the game log's version already carries the
 * three tones and the reason each is the color it is. A row that drew its own
 * would be a second definition of a win.
 *
 * There is deliberately **no stat line**. Runs and hits per game are on the
 * Stats tab's spans and in the box score one press away, and a row that carried
 * them would be a table where this is an index — the same call the Roster tab
 * makes about ranking.
 *
 * ## The read
 *
 * Lazy, on first open of the tab, keyed on the club — so a page opened on any
 * other tab never pays for it, which is the rule every read on the player page
 * follows. It is **not** keyed on the side switch, and that is a fact about
 * games rather than an omission: a club's result is its result, and there is no
 * batting reading of a 5–3 win.
 */
/**
 * **What has been said about this club lately** — the Overview's News block.
 *
 * It is the **recent-news map**, filtered to the club's own players, and that
 * choice is the whole of the design. The alternative was the roster page's
 * reading: fan out over the club's players and merge their notes, which is the
 * component `RosterNews` already is. Measured, that is what it would cost —
 * **a club carries about fifty players** (median 48, max 55, LAD 50), against a
 * fantasy roster's fifteen — so opening any club page would fire fifty
 * `getPlayerNews` reads, a hundred and fifty upstream requests, on the *default
 * tab*. A page's first tab must not be the most expensive thing in the app.
 *
 * The map costs **nothing at all**: `/api/news/recent` is one league-wide read
 * `App` already makes on boot for the news marks beside every name, held in
 * `RecentNewsContext`, and every player with news is in it. Filtering it to
 * thirty ids is a pass over a map already in memory.
 *
 * **What that buys and what it costs.** It reaches back **two days** — the map
 * carries today and yesterday and nothing older, by design (`recentNews.ts`) —
 * and it carries one headline per player rather than his whole feed. Both are
 * stated on the block rather than left to be discovered: the note says the
 * span, and every row is a door onto the man's own page, whose **News** tab has
 * the rest. A section that says "here is what has happened to this club since
 * you last looked, press for the whole of it" is what an Overview is for; a
 * section that quietly showed six weeks for six of the fifty men would not be.
 *
 * **Today before yesterday, then by name**, which is the honest sort: both
 * upstreams date to the day, so every note filed today ties with every other,
 * and the only thing left to order them by is the name the reader is scanning.
 * The same argument `RosterNews` makes for falling back to roster order.
 */
function TeamNews({
  team,
  players,
  onOpenDetails,
}: {
  team: TeamInfo;
  players: SeasonPlayer[];
  onOpenDetails: (key: string) => void;
}) {
  const map = useContext(RecentNewsContext);
  const rows = useMemo(() => {
    if (!map) return [];
    const out: { player: SeasonPlayer; news: RecentNews }[] = [];
    for (const p of players) {
      // **Joined on the club id, exactly as the Roster tab joins**: `players` is
      // the whole season roster the app holds from boot, so a block that read it
      // straight would put every man in the league on one club's page — seen,
      // 253 rows on the Dodgers' with Aaron Judge at the top of them.
      if (p.teamId !== team.id) continue;
      const news = map.get(p.id);
      if (news) out.push({ player: p, news });
    }
    out.sort(
      (a, b) =>
        b.news.date.localeCompare(a.news.date) || a.player.name.localeCompare(b.player.name),
    );
    return out;
  }, [map, players, team.id]);

  return (
    <section className="ovw-block ovw-starts">
      <div className="ovw-head-row">
        <h2 className="ovw-head">News</h2>
        {/* The span, in the head's own note slot, because it is the one thing a
            reader cannot infer from the rows: an empty block over a club with a
            quiet fortnight and an empty block over a club nobody has written
            about are the same block, and only this line tells them apart. */}
        <span
          className="start-note"
          title={`Everything MLB’s transactions and RotoWire’s desk have filed on a ${team.name} player today or yesterday. Older notes are on each player’s own News tab.`}
        >
          last 2 days
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="ovw-none">Nothing filed on a {team.name} player today or yesterday.</p>
      ) : (
        <ul className="news-list team-news">
          {rows.map(({ player, news }) => (
            <li key={player.id} className={`news-item team-news-item level-${news.level}`}>
              {/* A press, where the roster page's news rows are not — and the
                  difference is what is behind it. There every row already holds
                  the whole note; here it holds a headline, and the rest of it is
                  on the page this opens. A press with something behind it is the
                  rule; a press with nothing behind it is the fault. */}
              <button
                type="button"
                className="news-press"
                onClick={() => onOpenDetails(`${player.kind}-${player.id}`)}
                title={`Open ${player.name}’s page — his News tab has the whole note`}
              >
                <span className="news-meta">
                  <span className="news-who">{player.name}</span>
                  <span className="news-date">{news.level === 'today' ? 'Today' : 'Yesterday'}</span>
                </span>
                <span className="news-headline">{news.headline}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TeamResults({
  team,
  onOpenGame,
  limit,
  onSeeAll,
}: {
  team: TeamInfo;
  onOpenGame: GameDoor | null;
  /** **The most recent `limit` games**, for the Overview's own preview of this
   *  tab — the list arrives newest-first (`teamGames.ts` walks the season
   *  backwards), so the head of it is the head of it. */
  limit?: number;
  onSeeAll?: () => void;
}) {
  /* Keyed on the club alone — **not** on the side switch, and that is a fact
     about games rather than an omission: a club's result is its result, and
     there is no batting reading of a 5–3 win. */
  const gamesRes = useResource(`teamGames:${team.id}`, () => api.teamGames(team.id), {
    keepPrevious: false,
    staleMs: SEASON_STALE_MS,
  });
  const games = gamesRes.value ?? null;
  const error = gamesRes.error != null;
  const loading = gamesRes.loading;

  /* Rule 2: a block wait only where there is nothing to show, and only past
     `WAIT_DELAY` — a club already read comes back in a tick, and a wait that
     flashes reads as the page breaking. */
  const wait = useDelayedFlag(loading && games === null);

  if (games && games.length > 0) {
    const rows = limit === undefined ? games : games.slice(0, limit);
    const section = (
      <section className={`ovw-block ovw-starts${onSeeAll ? ' ovw-upcoming' : ''}`}>
        <div className="ovw-head-row">
          <h2 className="ovw-head">{limit === undefined ? 'Results' : 'Recent Games'}</h2>
          {onSeeAll ? (
            <button type="button" className="ovw-link" onClick={onSeeAll}>
              Results →
            </button>
          ) : (
            /* The count, in the head, for the reason the Roster tab's is: it is
               the answer to the question the heading asks, and a list of a
               hundred and thirty rows is one a reader scrolls rather than
               counts. **Only on the whole list**: a count over five rows would
               be the number five, which the reader can see. */
            <span className="start-note" title={`Games ${team.name} have played this season`}>
              {games.length}
            </span>
          )}
        </div>
        <ol className="start-list">
          {rows.map((g) => (
            <TeamResultRow key={g.gamePk} game={g} onOpenGame={onOpenGame} />
          ))}
        </ol>
      </section>
    );
    /* The tab draws its own page box; the Overview is already inside one, so a
       second `.details-overview` there would be a column inside a column. */
    return limit === undefined ? <div className="details-overview">{section}</div> : section;
  }
  if (wait) return <LoadingBlock>Reading {team.name}&rsquo;s games</LoadingBlock>;
  if (loading) return null;
  /* Two causes and two sentences — a read that failed and a club with nothing
     behind it are different facts, and one "no games" would claim the second in
     both cases. */
  const none = (
    <p className="ovw-none">
      {error
        ? `Couldn’t read ${team.name}’s games.`
        : `${team.name} haven’t played a game this season.`}
    </p>
  );
  return limit === undefined ? (
    <div className="details-overview">{none}</div>
  ) : (
    <section className="ovw-block ovw-starts">
      <div className="ovw-head-row">
        <h2 className="ovw-head">Recent Games</h2>
      </div>
      {none}
    </section>
  );
}

/**
 * One played game: the day, the matchup, the result.
 *
 * **The score is the club's own first**, which is the one place this app turns
 * a line score round: everywhere else `TOR 3–2 NYY` is away-first because the
 * reader is looking at a *game*, and here they are looking at one club's season
 * down a column — where the number that has to be in the same place on every
 * row is theirs. The chip's tooltip names both sides so nothing is lost.
 */
function TeamResultRow({ game, onOpenGame }: { game: TeamGameResult; onOpenGame: GameDoor | null }) {
  const score =
    game.teamScore !== null && game.opponentScore !== null
      ? `${game.teamScore}–${game.opponentScore}`
      : null;
  const decided = game.won !== null && game.state === 'final';
  /* The game log's own four tones, reached by the same three tests: decided, a
     game still being played, one that stopped and is not over, and one with a
     score and no result — which on a final game is a tie. */
  const tone = decided
    ? game.won
      ? 'w'
      : 'l'
    : game.state === 'live'
      ? 'live'
      : game.state === 'postponed'
        ? 'held'
        : 'none';
  const label = decided ? (game.won ? 'W' : 'L') : game.state === 'live' ? 'Live' : game.state === 'postponed' ? 'PPD' : null;
  const half = game.state === 'live' ? inningLabel(game.inningState, game.inning) : null;
  return (
    <li className="start-row">
      <div className="start-line">
        <span className="ovw-next-when">{prettyGameDate(game.date)}</span>
        <span className="ovw-next-opp">
          <OpponentPress
            onPress={onOpenGame && game.state !== 'postponed' ? () => onOpenGame(game.gamePk) : null}
            label={`${game.home ? 'vs' : '@'} ${game.opponent}`}
            opens="page"
            title={`${game.opponent} — the game’s page`}
          />
        </span>
        <span className="team-result-mark">
          <span
            className={`glog-res glog-res-${tone}`}
            title={
              decided
                ? `${game.won ? 'Won' : 'Lost'}${score ? ` ${score}` : ''}`
                : `${game.detailedState}${score ? ` — ${score} so far` : ''}`
            }
          >
            {label}
            {label && score ? ` ${score}` : score}
          </span>
          {half && <span className="team-result-half">{half}</span>}
        </span>
      </div>
    </li>
  );
}

/**
 * **Who plays for them**, off the season roster the client already holds — so
 * the tab costs no request at all, which is why it can afford to be a plain
 * list rather than a board.
 *
 * **One kind at a time, and the side switch is what picks it.** It drew both
 * lists under two headings at first, which made this the one tab on the page
 * the switch in the chrome did nothing to — a control pinned above every tab
 * that four of the five obey and the fifth ignores is a control that has
 * stopped meaning anything. It is also the app's own rule for a *roster*: the
 * Roster view has two tables and a kind tab over them, and the reorder screen
 * splits the same way. So `Batting` is the club's hitters and `Pitching` is its
 * arms, and the heading says which.
 *
 * That leaves the tab strip and the switch answering two different questions,
 * which is exactly what they should: the strip is *which reading of this club*,
 * and the switch is *which half of it*.
 *
 * Alphabetical, because nothing else here ranks them and a list a reader is
 * *scanning for a name* wants the order names come in. (The Stats tab is where
 * ranking lives, and the research board is where ranking *players* lives — this
 * is an index, not a leaderboard.)
 *
 * A two-way player is two rows under one id, here as everywhere: `SeasonPlayer`
 * carries one entry per kind and each is a different half of him with a page of
 * its own — so he is on both sides of the switch, correctly, once each.
 */
function TeamRoster({
  team,
  side,
  players,
  loading,
  onOpenDetails,
}: {
  team: TeamInfo;
  side: PlayerKind;
  players: SeasonPlayer[];
  loading: boolean;
  onOpenDetails: (key: string) => void;
}) {
  const wait = useDelayedFlag(loading);
  const list = useMemo(() => {
    // **Joined on the id, not on the printed name.** `SeasonPlayer.teamId` is
    // MLB's own, which is the whole reason it was put on that row; matching
    // `team` would be a join on a display string, and a club whose name this
    // list spells differently would come back empty rather than wrong — which
    // is worse, being indistinguishable from a club with nobody on it.
    //
    // The kind test is `!== 'pitcher'` rather than `=== 'batter'`, which is the
    // app's own reading of that field everywhere: a two-way player's batting
    // entry is `batter`, and anything MLB files as neither belongs with the
    // hitters rather than nowhere.
    return players
      .filter((p) => p.teamId === team.id && (side === 'pitcher') === (p.kind === 'pitcher'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players, team.id, side]);

  const heading = side === 'pitcher' ? 'Pitchers' : 'Batters';

  if (loading && list.length === 0) {
    return wait ? <LoadingBlock>Reading the league&rsquo;s players</LoadingBlock> : null;
  }
  if (list.length === 0) {
    return (
      <div className="details-overview">
        {/* An empty state names its own cause **and the control that caused
            it**: with the switch deciding which half is on screen, "nobody is
            filed under this club" would be the wrong sentence for a club whose
            hitters are all there and whose arms are missing. */}
        <p className="ovw-none">
          No {side === 'pitcher' ? 'pitchers' : 'batters'} on the season&rsquo;s player list are
          filed under {team.name}.
        </p>
      </div>
    );
  }
  return (
    <div className="details-overview">
      <section className="ovw-block ovw-starts">
        <div className="ovw-head-row">
          <h2 className="ovw-head">{heading}</h2>
          {/* The count, in the head, because it is the answer to the question
              the heading asks — and because a list of forty names is one a
              reader scrolls past rather than counts. */}
          <span className="start-note">{list.length}</span>
        </div>
        <ol className="start-list team-roster-list">
          {list.map((p) => (
            <li className="start-row" key={`${p.kind}-${p.id}`}>
              <div className="start-line team-roster-line">
                <button
                  type="button"
                  className="team-roster-name"
                  onClick={() => onOpenDetails(`${p.kind}-${p.id}`)}
                >
                  {p.name}
                </button>
                <span className="team-roster-pos">{p.position}</span>
                {/* His hand, in the tables' own token and off the same field —
                    `LHB`/`RHP` is what every row of the app says, and a roster
                    is exactly the list where the reader is looking for the
                    left-handers. */}
                <span className="team-roster-hand">
                  {p.kind === 'pitcher'
                    ? p.throws === 'L' || p.throws === 'R'
                      ? `${p.throws}HP`
                      : ''
                    : p.bats === 'L' || p.bats === 'R'
                      ? `${p.bats}HB`
                      : p.bats === 'S'
                        ? 'SH'
                        : ''}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
