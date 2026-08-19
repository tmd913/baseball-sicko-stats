import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { FantasyRosterContext, useDelayedFlag } from '../hooks';
import { projectStarters, rangeDatesOf } from '../lib';
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
  starters,
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
  /** **Only the players this manager actually had in his lineup**, and over a
   *  range only the days he had them there. The overlay owns the flag so it
   *  survives crossing from one manager to the other, exactly as the reading,
   *  the kind and the dates do. */
  starters: boolean;
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

  const kindCards = useMemo(
    () => (report ?? []).filter((r) => (kind === 'pitcher' ? r.kind === 'pitcher' : r.kind !== 'pitcher')),
    [report, kind],
  );

  /** The per-day lineup map, as `projectStarters` wants it. Collapsed to null
   *  when it is empty, so "no lineups" and "not asked for" are one state. */
  const byDate = useMemo(() => {
    if (!lineups) return null;
    const map = new Map<string, Set<number>>();
    for (const [date, ids] of Object.entries(lineups)) map.set(date, new Set(ids));
    return map.size > 0 ? map : null;
  }, [lineups]);

  const dates = useMemo(() => rangeDatesOf(start, end), [start, end]);
  const perDay = byDate !== null && dates.length > 1;

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
  const cards = useMemo(() => {
    if (!starters) return kindCards;
    const startingIds = new Set((roster ?? []).flatMap((p) => (p.starting && p.mlbId !== null ? [p.mlbId] : [])));
    return projectStarters(kindCards, dates, byDate, (r) => startingIds.has(r.id));
  }, [kindCards, starters, roster, byDate, dates]);

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
  /* **Two ways to empty this page, two messages**, which is the app's own rule
     for its own roster views: the message above names the days, and a page
     narrowed by a button in the row above has to name that button instead. The
     wording is the one that is true here — it is *his* lineup, not the
     reader's, so neither of the app's own sentences would do. */
  if (cards.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">
          {/* `possessive` rather than a plain `+ "’s"`, which on this league
              produced `The Homewreckers’s` — the same typo the slot chip's own
              owner already avoids, and the reason that helper is above. */}
          {perDay
            ? `Nothing to show — none of these ${kinds} were in ${possessive(who)} lineup on any of these days`
            : `Nothing to show — none of these ${kinds} are in ${possessive(who)} lineup`}
        </p>
        <p>
          Turn off “Starters” in the row above to see his whole team — the days he had these
          players on his bench or his IL are what it is leaving out.
        </p>
      </div>
    );
  }

  return (
    <FantasyRosterContext.Provider value={slots}>
      {reading === 'roster' ? (
        <SummaryTable
          reports={cards}
          onOpenDetails={onOpenDetails}
          schedule={schedule}
          projection={projection}
        />
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
