import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { FantasyRosterContext, useDelayedFlag } from '../hooks';
import type { FantasySlot } from '../hooks';
import { LoadingBlock } from './Loading';
import { LiveFeed, FEED_PAGE_SIZE } from './LiveFeed';
import { SummaryTable } from './SummaryTable';
import { TeamLogo, record } from './LeagueView';
import type {
  EspnRosterPlayer,
  EspnStandingsTeam,
  PlayerKind,
  PlayerReport,
} from '../types';

/**
 * One manager's team over one matchup period — **the app's own Roster and Feed
 * views, read for somebody else's roster.**
 *
 * The Matchup tab answers *how am I doing against him* a category at a time,
 * and the question directly under every row of it is *which of his players is
 * doing that to me*. Nothing on the League page could say it: the Rosters
 * toggle lists who is in each lineup and not one thing any of them has done,
 * and the Roster and Feed views next door are hard-wired to the reader's own
 * team. So each side of the matchup gets a page, and it is not a new reading —
 * it is `SummaryTable` and `LiveFeed`, the same two components the app draws
 * its own roster with, over the same shape of report.
 *
 * **The two are stacked rather than tabbed**, which is where this parts from
 * the app outside the league page. There they are two views because they are
 * two readings of the *whole* app's subject and each wants a page; here they
 * are the two halves of one question about one team over one week, and a third
 * tier of tabs (League tab → matchup side → roster or feed) is a tier of chrome
 * to save a scroll. The table is the week added up and the feed is the week as
 * it happened, in that order, which is the order the two questions come in.
 *
 * **The span is the matchup period's own**, `board.start`…`board.end` — the
 * very days the categories above were summed over, so a row here is the arithmetic
 * behind a cell there. For a week still being played that is the days played so
 * far, which is what makes the two agree rather than the table quietly
 * including a day the score does not.
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
  onOpenDetails,
}: {
  teamId: number;
  team: EspnStandingsTeam | undefined;
  /** The matchup period's own days. */
  start: string;
  end: string;
  /** Open a player's page — the same `${kind}-${id}` key every other route into
   *  it uses, so a name pressed here opens what a name pressed on the roster
   *  table opens. */
  onOpenDetails: (key: string) => void;
}) {
  const [report, setReport] = useState<PlayerReport[] | null>(null);
  const [roster, setRoster] = useState<EspnRosterPlayer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<PlayerKind>('batter');
  const shown = useRef<ShownByKind>({});
  const waiting = useDelayedFlag(loading);

  /**
   * **No ref guard on this effect**, and that is a rule rather than an
   * omission: marking a request as asked before it is answered is what left the
   * Rosters toggle spinning for ever under StrictMode — React mounts, tears
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
      // The roster **at the end of the period**, which is what a slot is a fact
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
    const owner = possessive(team?.name) ?? 'this team\u2019s';
    const map = new Map<string, FantasySlot>();
    for (const p of roster) {
      if (p.mlbId === null) continue;
      for (const k of p.kinds) {
        map.set(`${k}-${p.mlbId}`, {
          slot: p.slot,
          starting: p.starting,
          // Named rather than "today": this page is read for a week that may
          // have ended, and the day the slot came from is the honest thing to
          // print whichever week it is.
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

  const batters = useMemo(() => (report ?? []).filter((r) => r.kind !== 'pitcher'), [report]);
  const pitchers = useMemo(() => (report ?? []).filter((r) => r.kind === 'pitcher'), [report]);
  // Only when there is a choice to make, which is the rule the app's own kind
  // tabs follow — and the shown kind falls back to whichever list exists, so a
  // team of nothing but pitchers is not an empty page.
  const bothKinds = batters.length > 0 && pitchers.length > 0;
  const shownKind: PlayerKind = bothKinds
    ? kind
    : pitchers.length > 0 && batters.length === 0
      ? 'pitcher'
      : 'batter';
  const cards = shownKind === 'pitcher' ? pitchers : batters;

  const kindTabs = bothKinds ? (
    <div className="kind-switch" role="tablist" aria-label="Batters or pitchers">
      <button
        type="button"
        role="tab"
        aria-selected={shownKind === 'batter'}
        className={`kind-tab${shownKind === 'batter' ? ' active' : ''}`}
        onClick={() => setKind('batter')}
      >
        Batters
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={shownKind === 'pitcher'}
        className={`kind-tab${shownKind === 'pitcher' ? ' active' : ''}`}
        onClick={() => setKind('pitcher')}
      >
        Pitchers
      </button>
    </div>
  ) : null;

  const head = (
    <div className="lgt-head">
      <TeamLogo team={team} />
      <span className="lgt-id">
        <span className="lgt-name">{team?.name ?? `Team ${teamId}`}</span>
        {team && <span className="lgt-sub">{record(team)}</span>}
      </span>
      {kindTabs}
    </div>
  );

  // Never over data: a re-read (a period change is a different page, so this is
  // only ever the first read of one) leaves nothing on screen to protect, and
  // the block wait is behind the app's own delay so a warm answer never flashes
  // one.
  if (waiting) {
    return (
      <>
        {head}
        <LoadingBlock>Reading this team&rsquo;s week</LoadingBlock>
      </>
    );
  }
  if (error) {
    return (
      <>
        {head}
        <div className="empty-state">
          <h3>Couldn&rsquo;t read this team</h3>
          <p>{error}</p>
        </div>
      </>
    );
  }
  if (!report) return head;
  if (cards.length === 0) {
    return (
      <>
        {head}
        <div className="empty-state">
          <h3>Nobody on this team over these days</h3>
          <p>
            ESPN has no roster for {team?.name ?? `team ${teamId}`} over this matchup period.
          </p>
        </div>
      </>
    );
  }

  return (
    <FantasyRosterContext.Provider value={slots}>
      {head}
      {/* The week added up, then the week as it happened. Both are the app's
          own components, so a row here reads exactly as the same row does on
          the Roster page — the point of the tab being that it is the same
          reading of somebody else's team rather than a second one. */}
      <SummaryTable reports={cards} onOpenDetails={onOpenDetails} chrome={kindTabs} />
      <LiveFeed
        /* Keyed on the kind so the stream starts at its first page when the
           list becomes a different list — the app's own rule for its feed. */
        key={shownKind}
        reports={cards}
        kind={shownKind}
        onOpenDetails={onOpenDetails}
        shown={shown.current[shownKind] ?? FEED_PAGE_SIZE}
        onShowMore={(n) => {
          shown.current[shownKind] = n;
        }}
      />
    </FantasyRosterContext.Provider>
  );
}
