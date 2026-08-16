import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { FantasyRosterContext, useDelayedFlag } from '../hooks';
import type { FantasySlot } from '../hooks';
import { LoadingBlock } from './Loading';
import { LiveFeed, FEED_PAGE_SIZE } from './LiveFeed';
import { SummaryTable } from './SummaryTable';
import type { ScheduleIndex } from './schedule';
import type {
  EspnRosterPlayer,
  EspnStandingsTeam,
  PlayerKind,
  PlayerReport,
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
 * this component owns is its own two reads and its feed's paging position.
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

/** How much of the feed to open on, per kind — the app's own `feedShown`, one
 *  page down. A reading position rather than a view, so it is state rather than
 *  anything in the URL, and it is per kind because the two streams are two
 *  lists. */
type ShownByKind = Partial<Record<PlayerKind, number>>;

export default function LeagueTeam({
  teamId,
  team,
  start,
  end,
  kind,
  reading,
  schedule,
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
  /** The Schedule view's index, or null for the ordinary stat columns — the
   *  same "the mode is the presence of an index" rule App applies, so a table
   *  can never be in schedule mode with no schedule in it. */
  schedule: ScheduleIndex | null;
  /** Open a player's page — the same `${kind}-${id}` key every other route into
   *  it uses, so a name pressed here opens what a name pressed on the roster
   *  table opens. */
  onOpenDetails: (key: string) => void;
}) {
  const [report, setReport] = useState<PlayerReport[] | null>(null);
  const [roster, setRoster] = useState<EspnRosterPlayer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shown = useRef<ShownByKind>({});
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
        setRoster(ros);
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [teamId, start, end]);

  /**
   * The slot chips, for this team rather than the reader's.
   *
   * `owner` is what keeps the wording honest: the chip has always read "in
   * *your* fantasy lineup", which over a leaguemate's bench would be a lie of
   * exactly the kind the `day` field was added to stop. It is the possessive
   * form because that is where it lands in the sentence.
   *
   * `startedDays`/`rangeDays` are null, which is honest rather than lazy: the
   * count comes off a per-day lineup map, and this page reads one day's roster.
   * The chip then simply does not claim a count, which is what it already does
   * on a single-day range and with an older server.
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
          startedDays: null,
          rangeDays: null,
          owner,
        });
      }
    }
    return map;
  }, [roster, team, end]);

  const cards = useMemo(
    () => (report ?? []).filter((r) => (kind === 'pitcher' ? r.kind === 'pitcher' : r.kind !== 'pitcher')),
    [report, kind],
  );

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
  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <h3>No {kind === 'pitcher' ? 'pitchers' : 'batters'} on this team over these days</h3>
        <p>
          {team?.name ?? `Team ${teamId}`} had nobody of this kind on the roster over the days in
          view. The date control above is what changes them.
        </p>
      </div>
    );
  }

  return (
    <FantasyRosterContext.Provider value={slots}>
      {reading === 'roster' ? (
        <SummaryTable reports={cards} onOpenDetails={onOpenDetails} schedule={schedule} />
      ) : (
        <LiveFeed
          /* Keyed on the kind so the stream starts at its first page when the
             list becomes a different list — the app's own rule for its feed. */
          key={kind}
          reports={cards}
          kind={kind}
          onOpenDetails={onOpenDetails}
          shown={shown.current[kind] ?? FEED_PAGE_SIZE}
          onShowMore={(n) => {
            shown.current[kind] = n;
          }}
        />
      )}
    </FantasyRosterContext.Provider>
  );
}
