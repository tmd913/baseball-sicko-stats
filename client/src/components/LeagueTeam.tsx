import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { FantasyRosterContext, useDelayedFlag } from '../hooks';
import { useResource, useResourcePoll } from '../resource';
import {
  isInjured,
  LIVE_POLL_MS,
  possessive,
  projectStarters,
  rangeDatesOf,
  seatKinds,
  startedOn,
} from '../lib';
import type { FantasySlot } from '../hooks';
import { LoadingBlock } from './Loading';
import { LiveFeed, FEED_PAGE_SIZE } from './LiveFeed';
import { FeedFilterPills } from './FeedFilters';
import type { FeedLens } from './FeedFilters';
import { SummaryTable } from './SummaryTable';
import type { ScheduleIndex } from './schedule';
import { playerKey } from '../types';
import type { EspnStandingsTeam, RosterProjection } from '../types';
import { EmptyState } from './EmptyState';

/**
 * One manager's team over a span the reader picks — **the app's own Roster and
 * Feed views, read for somebody else's roster.**
 *
 * The matchup answers *how am I doing against him* a category at a time, and
 * the question directly under every row of it is *which of his players is doing
 * that to me*. Nothing on the League page could say it: the Roster and Feed
 * views next door are hard-wired to the reader's own team. So each side of the
 * matchup gets a page, and it is not a new reading — it is `SummaryTable` and
 * `LiveFeed`, the same two components the app draws its own roster with, over
 * the same shape of report.
 *
 * **Which reading and which days are both the overlay's**, handed
 * down rather than held here: they are chrome that sits above both team pages
 * and must not reset when the reader crosses from one manager to the other —
 * a date set on one side is a question about the matchup, not about a team. All
 * this component owns is its own two reads, its feed's paging position and the
 * row of pills at the head of it.
 */

/** How much of the feed to open on, per stream — the app's own `feedShown`, one
 *  page down. A reading position rather than a view, so it is state rather than
 *  anything in the URL.
 *
 *  **Keyed by the days**, exactly as App keys its own (`${start}-${end}`). It
 *  was keyed by kind *and* by the days while there were two streams; it was
 *  keyed by kind alone before that, so a reader who
 *  had pressed `Load more` twice over the matchup week and then moved the date
 *  control to today came back to a twenty-item stream carrying an offset of
 *  sixty. Two kinds over two ranges are four lists, and a reading position
 *  belongs to the list it was read in. */
type ShownByStream = Record<string, number>;

export default function LeagueTeam({
  teamId,
  team,
  start,
  end,
  reading,
  startersOnly = false,
  hideInjured = false,
  lens,
  onLens,
  schedule,
  projection,
  chrome,
  onOpenDetails,
}: {
  teamId: number;
  team: EspnStandingsTeam | undefined;
  /** The days in view, which default to today and are whatever the overlay's
   *  own date control says — including the whole matchup period, which is the
   *  preset that makes a row here the arithmetic behind a category above. */
  start: string;
  end: string;
  /** The table or the stream: the app's own two roster views, as two tabs. */
  reading: 'roster' | 'feed';
  /**
   * **Draw this manager's lineup rather than his roster** — the `Summary`
   * reading's own flag, and the one thing that makes that reading add up.
   *
   * The table is the same table either way; what changes is what is in it.
   * `Roster` is *who is on this team over these days* and counts every game
   * every man played, which is the honest answer to that question. `Summary` is
   * *what this manager has actually banked in the matchup*, and ESPN's answer
   * to that counts a man only on the scoring periods he held a lineup spot for
   * — bench and IL accrue nothing (`espn.ts::NON_ACCRUING_SLOTS`). Drawn over
   * the roster, the table was reading over its own totals: measured against the
   * live league on 2026-08-20 over `Aug 10 – Aug 20`, team 6's foot read
   * **56 R / 23 HR / 69 RBI** where ESPN's scoreboard read **55 / 22 / 67**,
   * and team 5's read **38 / 5 / 37** against ESPN's **36 / 5 / 35**.
   *
   * **It is `projectStarters` rather than a filter on the rows**, which is what
   * makes the difference land: that function cuts *days* — a man started on
   * Monday and benched on Wednesday keeps Monday's line and loses Wednesday's —
   * and it is the same one function the `Starters` filter and the divider above
   * the `Total` already run, so the three cannot come to disagree about an
   * afternoon. There was already a `starterCards` here, built for the divider's
   * key set and then thrown away; this draws it.
   */
  startersOnly?: boolean;
  /**
   * **The app's own hide-injured filter, applied to somebody else's roster.**
   *
   * It arrived with the Roster view's `Opponent` switch, which draws this page
   * in place of the reader's own table — and the whole promise of that switch
   * is that every control on the page goes on meaning what it meant. The
   * settings menu's toggle is one of them, so a leaguemate's page has to honor
   * it or the one control the reader cannot see from the row would silently
   * stop applying.
   *
   * `isInjured` on `rosterStatus`, which is `App.tsx`'s own `shownReports` test
   * run over these rows rather than a second one written here — and applied
   * ahead of everything below it for the same reason it is applied ahead of the
   * kind split there: the starters divider, the `Total` line and the feed all
   * describe the rows on screen, and a filter under any of them would leave one
   * of the three counting a player nobody can see.
   *
   * Default false, which is what the matchup page's own two team pages pass by
   * omission: that page has no settings menu and never had this filter.
   */
  hideInjured?: boolean;
  /** **Which kind of play the feed reading draws** — the app's own single-select
   *  lens, `all` being the whole stream. The overlay owns it for the reason it
   *  owns the reading, the kind and the dates; what this page owns is *where
   *  the row is drawn*, which is at the head of the stream and inside the same
   *  guard as it. */
  lens: FeedLens;
  onLens: (lens: FeedLens) => void;
  /** The Schedule view's index, or null for the ordinary stat columns — the
   *  same "the mode is the presence of an index" rule App applies, so a table
   *  can never be in schedule mode with no schedule in it. */
  schedule: ScheduleIndex | null;
  /** The projected reading, or null for the ordinary figures — the same "the
   *  mode is the presence of the answer" rule `schedule` follows one line up,
   *  so a table can never be projected with no projection in it. The overlay
   *  owns the flag and the read for the reason it owns the dates, and hands
   *  this down only once the answer has landed. */
  projection: RosterProjection | null;
  /** Open a player's page — the same `${kind}-${id}` key every other route into
   *  it uses, so a name pressed here opens what a name pressed on the roster
   *  table opens. */
  /**
   * **The page's own reading run and its date bar**, handed down because *where*
   * they are drawn is a fact about the reading rather than about the controls.
   *
   * On the **roster** reading this page is a fixed-height column in which only
   * `.summary-scroll` scrolls, and a sticky box sticks to the box that scrolls
   * — so the bar goes *inside* the pane (`SummaryTable`'s `paneChrome`) where
   * it and the table's header row stick against the same scrollport, exactly as
   * the app's own Roster page does it. On the **feed** reading the overlay is
   * the scroller and they are ordinary page content above the stream.
   *
   * It is drawn in every branch, the empty and failed ones included: the dates
   * are what a reader empties this page with, and an empty state naming "the
   * date control above" over a page with no date control is the one thing it
   * must not do.
   */
  chrome?: ReactNode;
  onOpenDetails: (key: string) => void;
}) {
  /**
   * **This page's two reads, as two keys on the resource store** — see
   * `resource.ts`. What used to be here was a `Promise.all` in an effect, a
   * `setReport(null)` before it, a hand-written poll and two sequence guards;
   * all four are properties of *where* a fetch lives rather than of what it
   * fetches, and all four now live in one place.
   *
   * **Two keys rather than one**, which is a change from the `Promise.all` and
   * is what lets only the half that moves be polled: the report tracks a plate
   * appearance and the roster behind the slot chips is a fact about the end of
   * the span. One compound key would have re-read ESPN's rosters every twenty
   * seconds to be told the same nine names. The page still draws them together
   * — see the gate below — so nothing a reader sees is any different.
   *
   * `espnRosters` is keyed on the day it anchors to rather than on the range,
   * because that is what it is a fact about: two spans ending on the same date
   * are one answer, and the matchup's other surfaces can share it.
   *
   * **Which of this team's players were in its lineup on each day of the
   * range** rides on the report rather than on a second request — what
   * `Starters` reads. `fantasyWatchlist` reads one roster per day to work out
   * which days each man was *held* for, so the lineups fall out of work
   * `/api/report` already does: the filter costs this page no upstream read at
   * all. It also means the lineups describe exactly the rows beside them, which
   * two reads a moment apart could not promise.
   *
   * Null where the per-day read failed or an older server answered, and there
   * the filter falls back to the end-of-range roster below — one lineup applied
   * to the range, which is what the app did before per-day lineups existed.
   */
  const reportKey = `report:fantasy:${teamId}:${start}:${end}`;
  const reportRes = useResource(reportKey, () =>
    api.report(start, end, 'fantasy', false, teamId),
  );
  /** The roster **at the end of the span**, which is what a slot is a fact
   *  about — the same anchor the app's own chips take. A read that fails costs
   *  the chips and not the page, so it resolves to null rather than rejecting:
   *  the resource holds `null` as an answer, and the page draws without them. */
  const rosterRes = useResource(
    `espnRosters:${teamId}:${end}`,
    () =>
      api
        .espnRosters([teamId], end)
        .then((r) => r.rosters[String(teamId)] ?? null)
        .catch(() => null),
  );

  const report = reportRes.value?.players ?? null;
  const lineups = reportRes.value?.lineups ?? null;
  const roster = rosterRes.value ?? null;
  const error = reportRes.error?.message ?? null;
  const shown = useRef<ShownByStream>({});
  /**
   * **Both halves, because the page is one page.** The `Promise.all` this
   * replaces is what kept a slot chip from landing a beat after the row it sits
   * in, and splitting the reads would have given that up for nothing. The wait
   * is behind the app's own delay, so a warm answer never flashes one — and
   * with the answers now outliving the component, stepping back onto a team
   * page draws what the app already had rather than a wait over an empty box.
   */
  const waiting = useDelayedFlag(reportRes.loading || rosterRes.loading);

  /**
   * **It re-reads itself while one of his men is batting**, on the
   * roster's own twenty seconds.
   *
   * This page had no poll at all before one was written by hand here, and
   * the fault it left is worth keeping the record of: the reads ran on
   * `[teamId, start, end]` and nothing else, so a team page opened at seven
   * o'clock was still drawing seven o'clock's lines at ten — while the
   * matchup card directly above it moved on the league's own clock
   * (`LEAGUE_POLL_MS`) and the app's own Roster view, which is *the same
   * component over the same shape of report*, moved every twenty seconds. Reported as the
   * matchup page being out of sync with everything else, and that is
   * exactly what it was: one page drawing two clocks, one of which had
   * stopped.
   *
   * **The roster's clock, not the league's**, because these rows are the
   * roster's rows: `SummaryTable` over a `PlayerReport`, whose
   * fastest-moving fact is a plate appearance. `LEAGUE_POLL_MS` is its own
   * number because it tracks a *week's* totals off ESPN's own board — it has
   * been a minute, then thirty seconds, and is twenty now; nothing about which
   * it is applies to a table of H/AB, which is the point of reading the
   * roster's clock here rather than the league's.
   *
   * **Gated on a real live game**, which is `App.tsx`'s own test for the
   * same poll (`hasRealLiveGame`) read off this page's own report: a team
   * whose men are all done for the night has nothing to re-read, and a
   * matchup left open overnight must not ask every twenty seconds to be
   * told so. The gate moves on its own as the answer lands — the last game
   * going final takes the poll down with it.
   */
  const anyLive = report?.some((r) => r.games.some((g) => g.status.state === 'live')) ?? false;
  useResourcePoll(reportKey, anyLive ? LIVE_POLL_MS : null);

  /** The per-day lineup map, as `projectStarters` wants it — **player keys**,
   *  a seat having a side of the ball (see `espn.ts::startedKeys`). Collapsed to
   *  null when it is empty, so "no lineups" and "not asked for" are one
   *  state. */
  const byDate = useMemo(() => {
    if (!lineups) return null;
    const map = new Map<string, Set<string>>();
    for (const [date, keys] of Object.entries(lineups)) map.set(date, new Set(keys));
    return map.size > 0 ? map : null;
  }, [lineups]);

  const dates = useMemo(() => rangeDatesOf(start, end), [start, end]);
  /**
   * The slot chips, for this team rather than the reader's.
   *
   * `owner` is what keeps the wording honest: the chip has always read "in
   * *your* fantasy lineup", which over a leaguemate's bench would be a lie of
   * exactly the kind the `day` field was added to stop. It is the possessive
   * form because that is where it lands in the sentence.
   *
   * `startedDays` is **the days this manager had him in his lineup**, off the
   * same per-day map the `Starters` filter on this page reads (`byDate`, with
   * the end-of-range roster as its fallback — `startedOn`'s own two tiers). It
   * was null here, on the stated grounds that "the count comes off a per-day
   * lineup map and this page reads one day's roster" — which was true of the
   * chip and stopped being true of the page: the map is read for the filter and
   * the projected table's `Starts` column needs the days to count the half of
   * the span that has been played. Null survives where there is no map, which
   * is what an older server and a failed read leave, and the chip goes on not
   * claiming a count there.
   */
  const slots = useMemo(() => {
    if (!roster) return null;
    const owner = possessive(team?.name) ?? 'this team’s';
    const map = new Map<string, FantasySlot>();
    for (const p of roster) {
      if (p.mlbId === null) continue;
      // Which of his rows this seat is a fact about — App's own rule over the
      // reader's roster, run here over a leaguemate's. See `lib.ts::seatKinds`.
      const seated = new Set(seatKinds(p.kinds, p.slotId));
      for (const k of p.kinds) {
        const key = `${k}-${p.mlbId}`;
        const starting = p.starting && seated.has(k);
        map.set(key, {
          slot: p.slot,
          starting,
          // Named rather than "today": this page is read over a span the reader
          // picks, and the day the slot came from is the honest thing to print
          // whichever span that is.
          day: end,
          injuryStatus: p.injuryStatus,
          startedDays:
            byDate === null ? null : dates.filter((d) => startedOn(byDate, d, key, starting)),
          rangeDays: byDate === null ? null : dates.length,
          owner,
        });
      }
    }
    return map;
  }, [roster, team, end, byDate, dates]);

  /** **Both kinds, in one list** — the tab row that used to cut this page in
   *  half is gone app-wide, and the table below stacks a batter table and a
   *  pitcher table by itself. See App's `viewCards` for the whole of that.
   *
   *  **And the hide-injured filter first**, ahead of the starters arithmetic and
   *  the stream alike — see `hideInjured`. */
  const teamCards = useMemo(
    () =>
      report === null
        ? []
        : hideInjured
          ? report.filter((r) => !isInjured(r.rosterStatus))
          : report,
    [report, hideInjured],
  );

  /** The stream's identity: which days — App's own `feedKey`, and what both the
   *  remount and the paging position are keyed by. It named a kind while there
   *  were two streams to tell apart; there is one. */
  const feedKey = `${start}-${end}`;

  /**
   * **The app's own projection, over somebody else's lineup.**
   *
   * `lib.ts::projectStarters` is what the reader's own roster views run, so a
   * range here cuts *days* rather than only rows in exactly the way it does
   * there — a man started on Monday and benched on Wednesday keeps Monday's
   * line and loses Wednesday's — and the two cannot drift.
   *
   * The end-of-range fallback is the roster this page already read for its slot
   * chips: `starting` is the flag on the day the span ends, which is the same
   * answer the app falls back to when a per-day read fails. **As keys rather
   * than ids**, and per seat — a manager holding a two-way player at `UTIL`
   * started his bat and not his arm, which is the reading ESPN's own summary
   * takes and so the one this page's `Summary` foot has to.
   */
  const starterCards = useMemo(() => {
    const startingKeys = new Set(
      (roster ?? []).flatMap((p) =>
        p.starting && p.mlbId !== null
          ? seatKinds(p.kinds, p.slotId).map((k) => `${k}-${p.mlbId}`)
          : [],
      ),
    );
    return projectStarters(teamCards, dates, byDate, (r) => startingKeys.has(playerKey(r)));
  }, [teamCards, roster, byDate, dates]);
  /**
   * **The same answer as a set of player keys**, for the summary table's `Total`
   * divider — `SummaryTable.tsx::splitStarters`, and App does this on its own
   * roster in the same two lines.
   */
  const starterKeys = useMemo(() => new Set(starterCards.map(playerKey)), [starterCards]);
  /**
   * **What the table draws** — the roster, or the lineup out of it. See
   * `startersOnly`.
   *
   * The `Total` divider is left reading `starterKeys` rather than being turned
   * off here, and that is deliberate: `splitStarters` already answers "nothing
   * below the line" with the row at the bottom over everybody, which is exactly
   * what this reading wants and is one rule rather than two. A second flag
   * saying "and don't split" would be a second way to describe the same table.
   *
   * **And on the `Summary` reading it is the whole roster with the lineup's
   * arithmetic on it**, which is where this used to draw `starterCards` alone
   * and quietly lose a man.
   *
   * `projectStarters` drops a player who held an accruing slot on **none** of the
   * days in view — its own rule, and the right one for the days it cuts, since
   * such a man contributed nothing to the categories this reading adds up. Drawn
   * straight, that dropped him off the page: measured on team 6 over
   * `Aug 10 – Aug 21`, `Summary` listed 29 of the 34 men `/api/report` answered
   * with, and the five missing were **Kyle Stowers, Shea Langeliers, Garrett
   * Crochet, Nick Pivetta and Hunter Greene** — every one of them on the roster
   * for days of that range, three of them on it *now*, and nothing on screen
   * saying they had been left out. It read as a table that had forgotten a
   * player, which is what was reported.
   *
   * So a man the filter dropped is kept with **no games** rather than removed —
   * `projectStarters`' own distinction, stated in as many words there: *a player
   * kept with no games left is not the same as one dropped*. He is not in
   * `starterKeys`, so `splitStarters` puts him under the `Total` line and the
   * figure on that line is unchanged — the reading still adds up to ESPN's
   * scoreboard, which is the whole of what it is for. What changes is that the
   * label reads `Total · 13 of 15` instead of `Total · 13`, which is the app's
   * own `n of m` and says how many it left out.
   *
   * The order is `teamCards`' — the roster's own — rather than the starters
   * first and the rest after, since `splitStarters` does the splitting and a
   * second ordering here would be a second opinion about it.
   */
  const summaryCards = useMemo(() => {
    const cut = new Map(starterCards.map((r) => [playerKey(r), r]));
    return teamCards.map((r) => cut.get(playerKey(r)) ?? (r.games.length === 0 ? r : { ...r, games: [] }));
  }, [teamCards, starterCards]);
  const shownCards = startersOnly ? summaryCards : teamCards;

  // Never over data: the block wait is behind the app's own delay, so a warm
  // answer never flashes one, and a span change re-reads with the old rows
  // still on screen until the new ones land.
  if (waiting && !report)
    return (
      <>
        {chrome}
        <LoadingBlock>Reading this team&rsquo;s games</LoadingBlock>
      </>
    );
  if (error) {
    return (
      <>
        {chrome}
        <EmptyState title="Couldn’t read this team">
          <p>{error}</p>
        </EmptyState>
      </>
    );
  }
  if (!report) return <>{chrome}</>;
  const who = team?.name ?? `Team ${teamId}`;
  if (teamCards.length === 0) {
    return (
      <>
        {chrome}
        <EmptyState title="Nobody on this team over these days">
          <p>
            {who} had nobody on the roster over the days in view. The date control above is what
            changes them.
          </p>
        </EmptyState>
      </>
    );
  }
  /* **The lineup can be empty where the roster is not**, and the message says
     which of the two emptied the page rather than claiming a fact about the
     days: a manager who left every slot on the bench has a team and no lineup.
     It names `Summary` because that is the control in force — the rule every
     empty state in this app follows.

     **The test is `starterCards` rather than `shownCards`**, and it moved with
     the reading: `shownCards` is the whole roster now (see `summaryCards`), so
     it empties only when the team does — which the branch above already answers
     for. What this one is about is the lineup, so it asks about the lineup. A
     manager who started nobody gets the sentence rather than twenty-eight rows
     of noughts under a `Total · 0 of 28`, which states the same fact and states
     it as a table. */
  if (startersOnly && starterCards.length === 0) {
    return (
      <>
        {chrome}
        <EmptyState title="Nobody in this lineup over these days">
          <p>
            {who} started nobody over the days in view, so there is nothing for this matchup to
            have counted. <strong>Roster</strong> above has the whole team, bench included.
          </p>
        </EmptyState>
      </>
    );
  }

  return (
    <FantasyRosterContext.Provider value={slots}>
      {reading === 'roster' ? (
        <SummaryTable
          reports={shownCards}
          onOpenDetails={onOpenDetails}
          schedule={schedule}
          projection={projection}
          /* Who sits above the `Total` line — see `splitStarters`. */
          starters={starterKeys}
          /* Inside the pane, so the bar and the header row stick against the
             same scrollport — see `chrome`. */
          paneChrome={chrome}
        />
      ) : (
        <>
          {chrome}
          {/* **The lens, at the head of the stream it narrows** — the Feed
              view's own row of pills, drawn from the same component so a reader
              who knows that page knows this one, and drawn *here* rather than up
              in `mup-tools` for the reason it is in the page there: it is the
              answer to the question this page was opened with, and it belongs
              where the answer is.

              **Inside the same guard as the feed**, which is why it is in this
              file rather than beside `<LeagueTeam>`: a row of pills over an
              empty page would be a control over nothing, and the two empty
              states above already name the control that emptied them.

              **Batter tab only** (`kind === 'batter'`), the same flag that gates
              the prop below so the two cannot disagree: a pitcher's stream item
              is his whole outing rather than a play, so no pill here could match
              one and passing the lens through would empty the pitcher feed on
              behalf of a control that tab does not offer. The *state* is the
              overlay's and survives the excursion. */}
          {/* **The order toggle has left this row for `mup-tools`**, which is
              the Feed view's own move one page along: there it went to the
              pinned tab row, here to this page's control run, and the reason is
              the same either side — the pills are worked on arrival and an
              order is wanted halfway down a stream, where a control at the head
              of the page is a scroll back up. So this row is the kinds alone.
              It was drawn on the batter tab alone, there being nothing for a
              lens to narrow on the other one; the stream carries both kinds
              now, and the pills narrow the plays in it while the outings
              section above them is left whole — see `LiveFeed`'s `outings`. */}
          <FeedFilterPills lens={lens} onSelect={onLens} />
          <LiveFeed
            /* Keyed on the days, so the stream starts at its first page when
               the list becomes a different list — the app's own `feedKey`. **Not on the lens**: narrowing to home runs is the same
               list read through a lens rather than another list, and App does
               not key on it either. */
            key={feedKey}
            reports={teamCards}
            onOpenDetails={onOpenDetails}
            shown={shown.current[feedKey] ?? FEED_PAGE_SIZE}
            onShowMore={(n) => {
              shown.current[feedKey] = n;
            }}
            /* **The play filter comes across and the `New` watermark does not.**
               The marker is a fact about how far down the reader's *own* stream
               they have got — one saved watermark on their record, not one per
               team — so a red count over a leaguemate's plays would count his
               day against it and `Clear` would mark the reader's own feed read
               from a page that is not it. See `LeagueMatchup`'s `feedLens`. */
            playFilter={lens !== 'all' ? lens : undefined}
          />
        </>
      )}
    </FantasyRosterContext.Provider>
  );
}
