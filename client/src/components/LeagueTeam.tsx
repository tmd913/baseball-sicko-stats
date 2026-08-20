import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { FantasyRosterContext, useDelayedFlag } from '../hooks';
import { projectStarters, rangeDatesOf, startedOn } from '../lib';
import type { FantasySlot } from '../hooks';
import { LoadingBlock } from './Loading';
import { LiveFeed, FEED_PAGE_SIZE } from './LiveFeed';
import { FeedFilterPills } from './FeedFilters';
import type { FeedLens } from './FeedFilters';
import { SummaryTable } from './SummaryTable';
import type { ScheduleIndex } from './schedule';
import { playerKey } from '../types';
import type {
  EspnRosterPlayer,
  EspnStandingsTeam,
  PlayerKind,
  PlayerReport,
  RosterProjection,
} from '../types';

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
 * **Which reading, which kind and which days are all the overlay's**, handed
 * down rather than held here: they are chrome that sits above both team pages
 * and must not reset when the reader crosses from one manager to the other —
 * a date set on one side is a question about the matchup, not about a team. All
 * this component owns is its own two reads, its feed's paging position and the
 * row of pills at the head of it.
 */

/**
 * A team name in the possessive, for the slot chip's title.
 *
 * **A name already ending in `s` takes the bare apostrophe** — `Baldy's Bozos'`
 * rather than `Baldy's Bozos's`, which is what a plain `+ "'s"` produced on the
 * live league and reads as a typo on every chip of that manager's page.
 */
function possessive(name: string | undefined): string | null {
  if (!name) return null;
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/** How much of the feed to open on, per stream — the app's own `feedShown`, one
 *  page down. A reading position rather than a view, so it is state rather than
 *  anything in the URL.
 *
 *  **Keyed by kind *and* by the days**, exactly as App keys its own
 *  (`${shownKind}-${start}-${end}`): it was keyed by kind alone, so a reader who
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
  kind,
  reading,
  lens,
  onLens,
  oldestFirst,
  schedule,
  projection,
  onOpenDetails,
}: {
  teamId: number;
  team: EspnStandingsTeam | undefined;
  /** The days in view, which default to today and are whatever the overlay's
   *  own date control says — including the whole matchup period, which is the
   *  preset that makes a row here the arithmetic behind a category above. */
  start: string;
  end: string;
  kind: PlayerKind;
  /** The table or the stream: the app's own two roster views, as two tabs. */
  reading: 'roster' | 'feed';
  /** **Which kind of play the feed reading draws** — the app's own single-select
   *  lens, `all` being the whole stream. The overlay owns it for the reason it
   *  owns the reading, the kind and the dates; what this page owns is *where
   *  the row is drawn*, which is at the head of the stream and inside the same
   *  guard as it. */
  lens: FeedLens;
  onLens: (lens: FeedLens) => void;
  /** Which way the stream runs, and the press that turns it — the overlay's,
   *  beside the lens, so crossing to the other manager keeps both. */
  oldestFirst: boolean;
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
  onOpenDetails: (key: string) => void;
}) {
  const [report, setReport] = useState<PlayerReport[] | null>(null);
  /**
   * **Which of this team's players were in its lineup on each day of the
   * range** — what `Starters` reads, and it rides on the report rather than on
   * a second request.
   *
   * `fantasyWatchlist` reads one roster per day to work out which days each man
   * was *held* for, so the lineups fall out of work `/api/report` already does:
   * the filter costs this page no upstream read at all. It also means the
   * lineups describe exactly the rows beside them, which two reads a moment
   * apart could not promise.
   *
   * Null where the per-day read failed or an older server answered, and there
   * the filter falls back to the end-of-range roster below — one lineup applied
   * to the range, which is what the app did before per-day lineups existed.
   */
  const [lineups, setLineups] = useState<Record<string, number[]> | null>(null);
  const [roster, setRoster] = useState<EspnRosterPlayer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shown = useRef<ShownByStream>({});
  const waiting = useDelayedFlag(loading);

  /**
   * **No ref guard on this effect**, and that is a rule rather than an
   * omission: marking a request as asked before it is answered is what left the
   * old Rosters toggle spinning for ever under StrictMode — React mounts, tears
   * down and re-runs, so the first pass's answer is discarded by its own
   * cleanup and the second pass sees the mark and returns. The dependency array
   * is the whole of the guard, and it names exactly what the answer depends on.
   *
   * The two reads are one `Promise.all` because they are one page: the report
   * is what the tables draw and the roster is where each player's slot chip
   * comes from, and drawing the first without the second would put every chip
   * on the page a beat after the rows they sit in.
   */
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setReport(null);
    setLineups(null);
    setRoster(null);
    Promise.all([
      api.report(start, end, 'fantasy', false, teamId),
      // The roster **at the end of the span**, which is what a slot is a fact
      // about — the same anchor the app's own chips take. A read that fails
      // costs the chips and not the page, so it resolves to null rather than
      // rejecting the pair.
      api
        .espnRosters([teamId], end)
        .then((r) => r.rosters[String(teamId)] ?? null)
        .catch(() => null),
    ])
      .then(([rep, ros]) => {
        if (!live) return;
        setReport(rep.players);
        setLineups(rep.lineups ?? null);
        setRoster(ros);
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [teamId, start, end]);

  /** The per-day lineup map, as `projectStarters` wants it. Collapsed to null
   *  when it is empty, so "no lineups" and "not asked for" are one state. */
  const byDate = useMemo(() => {
    if (!lineups) return null;
    const map = new Map<string, Set<number>>();
    for (const [date, ids] of Object.entries(lineups)) map.set(date, new Set(ids));
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
      for (const k of p.kinds) {
        map.set(`${k}-${p.mlbId}`, {
          slot: p.slot,
          starting: p.starting,
          // Named rather than "today": this page is read over a span the reader
          // picks, and the day the slot came from is the honest thing to print
          // whichever span that is.
          day: end,
          injuryStatus: p.injuryStatus,
          startedDays:
            byDate === null
              ? null
              : dates.filter((d) => startedOn(byDate, d, p.mlbId as number, p.starting)),
          rangeDays: byDate === null ? null : dates.length,
          owner,
        });
      }
    }
    return map;
  }, [roster, team, end, byDate, dates]);

  const kindCards = useMemo(
    () => (report ?? []).filter((r) => (kind === 'pitcher' ? r.kind === 'pitcher' : r.kind !== 'pitcher')),
    [report, kind],
  );

  /** The stream's identity: which kind, over which days — App's own `feedKey`,
   *  and what both the remount and the paging position are keyed by. */
  const feedKey = `${kind}-${start}-${end}`;

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
   * answer the app falls back to when a per-day read fails.
   */
  const starterCards = useMemo(() => {
    const startingIds = new Set((roster ?? []).flatMap((p) => (p.starting && p.mlbId !== null ? [p.mlbId] : [])));
    return projectStarters(kindCards, dates, byDate, (r) => startingIds.has(r.id));
  }, [kindCards, roster, byDate, dates]);
  /**
   * **The same answer as a set of player keys**, for the summary table's `Total`
   * divider — `SummaryTable.tsx::splitStarters`, and App does this on its own
   * roster in the same two lines.
   */
  const starterKeys = useMemo(() => new Set(starterCards.map(playerKey)), [starterCards]);

  // Never over data: the block wait is behind the app's own delay, so a warm
  // answer never flashes one, and a span change re-reads with the old rows
  // still on screen until the new ones land.
  if (waiting && !report) return <LoadingBlock>Reading this team&rsquo;s games</LoadingBlock>;
  if (error) {
    return (
      <div className="empty-state">
        <h3>Couldn&rsquo;t read this team</h3>
        <p>{error}</p>
      </div>
    );
  }
  if (!report) return null;
  const who = team?.name ?? `Team ${teamId}`;
  const kinds = kind === 'pitcher' ? 'pitchers' : 'batters';
  if (kindCards.length === 0) {
    return (
      <div className="empty-state">
        <h3>No {kinds} on this team over these days</h3>
        <p>
          {who} had nobody of this kind on the roster over the days in view. The date control
          above is what changes them.
        </p>
      </div>
    );
  }

  return (
    <FantasyRosterContext.Provider value={slots}>
      {reading === 'roster' ? (
        <SummaryTable
          reports={kindCards}
          onOpenDetails={onOpenDetails}
          schedule={schedule}
          projection={projection}
          /* Who sits above the `Total` line — see `splitStarters`. */
          starters={starterKeys}
        />
      ) : (
        <>
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
              of the page is a scroll back up. So this row is the kinds alone
              and is drawn on the batter tab alone: with the toggle gone, a
              pitcher tab would draw an empty row. */}
          {kind === 'batter' && <FeedFilterPills lens={lens} onSelect={onLens} />}
          <LiveFeed
            /* Keyed on the kind and the days, so the stream starts at its first
               page when the list becomes a different list — the app's own
               `feedKey`. **Not on the lens**: narrowing to home runs is the same
               list read through a lens rather than another list, and App does
               not key on it either. */
            key={feedKey}
            reports={kindCards}
            kind={kind}
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
            playFilter={kind === 'batter' && lens !== 'all' ? lens : undefined}
            oldestFirst={oldestFirst}
          />
        </>
      )}
    </FantasyRosterContext.Provider>
  );
}
