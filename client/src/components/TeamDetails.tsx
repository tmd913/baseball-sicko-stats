import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { fmt, formatStartTime, prettyGameDate, surname, teamColor, teamLogoUrl } from '../lib';
import { useDelayedFlag } from '../hooks';
import { DetailsShell, DetailsTabButton } from './DetailsShell';
import { LoadingBlock, LoadingLine } from './Loading';
import { OpponentSection } from './OpponentTable';
import { ParkTable } from './ParkFactors';
import { PlayerWindowTable } from './PlayerWindowTable';
import { buildScheduleIndex, gamesOn, opponentText, spanPhrase } from './schedule';
import type { PitcherLookup } from './schedule';
import type {
  PlayerKind,
  PlayerWindows,
  ResearchRow,
  ScheduleGame,
  ScheduleWindow,
  SeasonPlayer,
  SplitCut,
  TeamHitting,
  TeamInfo,
} from '../types';

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
type TeamTab = 'overview' | 'schedule' | 'roster' | 'splits' | 'park' | 'stats';

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
}) {
  const [tab, setTab] = useState<TeamTab>('overview');

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
  const [windows, setWindows] = useState<PlayerWindows | null>(null);
  const [windowsError, setWindowsError] = useState<string | null>(null);
  const [windowsLoading, setWindowsLoading] = useState(false);
  /**
   * Which read is on screen, as the request's own key.
   *
   * **Never marked before it is answered**, the rule `hooks.ts` and the player
   * page's percentile tab both carry: React StrictMode mounts, tears down and
   * re-runs, so a mark set on the way *out* of an effect whose cleanup discards
   * the answer leaves the second pass returning early and the wait up for ever.
   * Here the mark is the sequence test as well — a stale answer is one whose key
   * is no longer the current one, and only the newest may write.
   */
  const windowsReq = useRef<string | null>(null);
  useEffect(() => {
    const req = `${team.id}:${side}`;
    if (windowsReq.current === req) return;
    windowsReq.current = req;
    setWindowsLoading(true);
    setWindowsError(null);
    api.teamWindows(team.id, side).then(
      (w) => {
        if (windowsReq.current !== req) return;
        setWindows(w);
        setWindowsLoading(false);
      },
      (e: Error) => {
        if (windowsReq.current !== req) return;
        setWindowsError(e.message);
        setWindowsLoading(false);
        windowsReq.current = null; // allow a retry on a tab or side change
      },
    );
  }, [team.id, side]);

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
  const [splits, setSplits] = useState<TeamHitting | null>(null);
  const [splitsError, setSplitsError] = useState(false);
  /* **A state flag rather than the request ref**, and the difference is one the
     app's loading rules make explicit: the ref is not reactive, so a wait
     tested against it is tested on a render that has already happened — the
     effect runs *after* the first paint, and the next render is the answer
     landing. Read off the ref, the block wait could never appear at all. */
  const [splitsLoading, setSplitsLoading] = useState(false);
  const splitsReq = useRef<string | null>(null);
  useEffect(() => {
    const req = `${team.id}:${side}`;
    if (tab !== 'splits' || splitsReq.current === req) return;
    splitsReq.current = req;
    setSplitsError(false);
    setSplitsLoading(true);
    api.teamSplits(team.id, 'season', side === 'pitcher' ? 'pitching' : 'batting').then(
      (b) => {
        if (splitsReq.current !== req) return;
        setSplits(b);
        setSplitsLoading(false);
      },
      () => {
        if (splitsReq.current !== req) return;
        splitsReq.current = null;
        setSplitsError(true);
        setSplitsLoading(false);
      },
    );
  }, [tab, team.id, side]);
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
           differs is only what a press does. On a player it is navigation, a
           two-way man being two pages under one id; here it is a reading of one
           page, because a club is always both halves at once and nobody would
           call the Brewers' pitching a different club. */
        <div className="details-kind-row">
          <div className="view-switch" role="tablist" aria-label="Which side of the ball">
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
          </div>
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
      {tab === 'overview' && (
        <div className="details-overview">
          <TeamSeasonBlock
            team={team}
            side={side}
            row={seasonRow}
            loading={windowsLoading}
            error={windowsError}
            onSeeAll={() => setTab('stats')}
          />
          <TeamGames
            team={team}
            scheduleWindow={scheduleWindow}
            scheduleError={scheduleError}
            onNeedSchedule={onNeedSchedule}
            pitcherLookup={pitcherLookup}
            onOpenDetails={onOpenDetails}
            limit={PREVIEW}
            onSeeAll={() => setTab('schedule')}
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
          />
        </div>
      )}

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
            <div className="details-status details-error">
              Couldn&rsquo;t read {team.name}&rsquo;s splits.
            </div>
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
          /* **No cut control**, and the table hides it on this reading: the club
             boards carry no split at all, so the four buttons would be four
             requests for a table that cannot change. See `teamResearch.ts`. */
          cut={null}
          onCutChange={noCut}
          updating={windowsLoading}
        />
      )}
      {tab === 'stats' && !windows && windowsLoading && (
        <LoadingBlock>Reading {team.name}&rsquo;s board</LoadingBlock>
      )}
      {tab === 'stats' && !windows && windowsError && (
        <div className="details-status details-error">
          Couldn&rsquo;t read {team.name}&rsquo;s board: {windowsError}
        </div>
      )}
    </DetailsShell>
  );
}

/** The Stats table's cut handler where there are no cuts — see the call site.
 *  Declared once at module scope so it is not a new function every render. */
const noCut = (_cut: SplitCut | null) => {};

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
  limit,
  onSeeAll,
}: {
  team: TeamInfo;
  scheduleWindow: ScheduleWindow | null;
  scheduleError: string | null;
  onNeedSchedule: () => void;
  pitcherLookup: PitcherLookup;
  onOpenDetails: (key: string) => void;
  limit?: number;
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
    return limit === undefined ? out : out.slice(0, limit);
  }, [index, team.id, limit]);

  const loading = scheduleWindow === null && scheduleError === null;
  const wait = useDelayedFlag(loading);
  const heading = limit === undefined ? 'Schedule' : 'Next Games';

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
          ) : (
            <span
              className="start-note"
              title={`Every game ${team.name} are scheduled to play ${phrase}. A postponement is not a game they get, so it is not here.`}
            >
              {phrase.replace(/^in /, '')}
            </span>
          )}
        </div>
        <ol className="start-list">
          {rows.map((g) => (
            <TeamGameRow
              key={g.gamePk}
              game={g}
              teamId={team.id}
              pitcherLookup={pitcherLookup}
              onOpenDetails={onOpenDetails}
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
}: {
  game: ScheduleGame;
  teamId: number;
  pitcherLookup: PitcherLookup;
  onOpenDetails: (key: string) => void;
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
            the two wide tables' cells say a fixture the same way. */}
        <span className="ovw-next-opp">{opponentText(game, teamId)}</span>
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
