import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { api } from '../api';
import type {
  BatterGameLog,
  PitcherGameLog,
  PitcherSeasonStats,
  PlayerPercentiles,
  PercentileMetric,
  PlayerKind,
  PlayerNews,
  PlayerReport,
  PlayerWindows,
  ResearchRow,
  SeasonArsenal,
  SeasonStats,
  XwobaSeries,
} from '../types';
import { headshotUrl, savantPlayerUrl, statusCorner } from '../lib';
import { MovementChart, PitchUsageChart } from './ArsenalCharts';
import { RemoveButton } from './RemoveButton';
import { PhotoSpot, PhotoStatus, useStatusBadge } from './PhotoStatus';
import { BaseballMark } from './BaseballMark';
import { LockMark } from './LockMark';
import { PlayerNewsMark } from './NewsMark';
import { RollingXwoba } from './RollingXwoba';
import { GameLog } from './GameLog';
import { PlayerWindowTable } from './PlayerWindowTable';
import { NewsTab } from './PlayerNews';
import { BatterSplitsTab, PitcherSplitsTab } from './PlatoonSplits';
import { LoadingBlock } from './Loading';
import {
  useDelayedFlag,
  answersEscape,
  useLockBodyScroll,
  useOverlayFocus,
  useOverlayChromeOffset,
  usePlayerStatus,
} from '../hooks';
import { OverviewTab } from './PlayerOverview';
import { DialogLayerContext, OVERLAY_LAYER } from './Modal';
import { BackButton } from './BackButton';

/**
 * Savant's diverging percentile scale: deep blue (poor, 0) → neutral grey
 * (average, 50) → red (great, 100). The bubble is filled solid at this color
 * and carries the percentile number in white, so identity never rests on hue
 * alone; the bar behind it is the same color at reduced opacity. The grey
 * midpoint is kept dark enough that white numerals stay legible across the range.
 */
const POOR: [number, number, number] = [50, 90, 161];
const AVG: [number, number, number] = [138, 143, 153];
const GREAT: [number, number, number] = [210, 45, 73];

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

function pctColor(p: number): string {
  return p <= 50 ? mix(POOR, AVG, p / 50) : mix(AVG, GREAT, (p - 50) / 50);
}

/** One metric row: label · bar with percentile bubble · raw value. */
function MetricRow({ metric }: { metric: PercentileMetric }) {
  const { label, percentile, value, estimated } = metric;
  const has = percentile !== null;
  const color = has ? pctColor(percentile) : undefined;
  // A row with a value but no percentile is not the same as a row with nothing:
  // it is a stat Savant measures and publishes no league distribution for, so
  // there is no honest bar to draw (the two baserunning splits — see the note on
  // them in `percentiles.ts`). Saying "no data" over a printed number read as a
  // bug in the number rather than an absence of the rank beside it.
  const title = has
    ? `${label} — ${percentile}th percentile${value ? ` (${value})` : ''}` +
      (estimated ? ' · estimated from league avg (no exact Savant rank)' : '')
    : value
      ? `${label} — ${value} · no league rank published for this stat`
      : `${label} — no data`;
  return (
    <div className="pct-row" title={title}>
      <span className="pct-label">{label}</span>
      <div className="pct-track">
        {has && (
          <>
            <span
              className="pct-fill"
              style={{ width: `${percentile}%`, background: color }}
            />
            <span
              className={`pct-bubble${estimated ? ' pct-bubble--est' : ''}`}
              style={{ left: `${percentile}%`, background: color }}
            >
              {percentile}
            </span>
          </>
        )}
      </div>
      <span className="pct-value">{value ?? '–'}</span>
    </div>
  );
}

/** Actual-stat key → its expected (x-) counterpart. When both are present in a
 * section they collapse into one dumbbell row instead of two stacked bars. */
const EXPECTED_OF: Record<string, string> = {
  woba: 'xwoba',
  // Pitcher-only: the card's headline pair — what he gave up against what the
  // contact he gave up was worth.
  era: 'xera',
  ba: 'xba',
  obp: 'xobp',
  slg: 'xslg',
  iso: 'xiso',
  hr: 'xhr',
  // Pitcher-only: what the contact he allowed was worth, against what it should
  // have been worth.
  wobacon: 'xwobacon',
};

/**
 * How far a finger may travel between pointerdown and pointerup and still count
 * as a tap rather than the start of a scroll. Chromium's own touch-slop figure.
 */
const TAP_SLOP = 8;

/**
 * A combined actual/expected row. At rest it reads as a normal row for the
 * EXPECTED stat — a filled bar with a solid bubble at the expected percentile —
 * so the card is calm by default. On hover (mouse) or a deliberate tap (touch,
 * see `TAP_SLOP`) it reveals the
 * dumbbell: the fill recedes and the ACTUAL percentile appears as a ring joined
 * to the expected bubble by a connector, so the actual↔expected gap (over/under-
 * performance) is on-demand rather than always-on. Values follow suit: expected
 * shown by default, actual stacked above it once revealed.
 *
 * When revealed and the two percentiles fall within a bubble-width of each other
 * (`overlapPct`, from the live track width) the markers would collide, so they
 * split into two vertical lanes (actual up, expected down) to stay legible.
 */
function PairRow({
  actual,
  expected,
  overlapPct,
}: {
  actual: PercentileMetric;
  expected: PercentileMetric;
  overlapPct: number;
}) {
  const a = actual.percentile;
  const e = expected.percentile;
  const aColor = a !== null ? pctColor(a) : undefined;
  const eColor = e !== null ? pctColor(e) : undefined;
  const both = a !== null && e !== null;
  const [revealed, setRevealed] = useState(false);
  // Where a touch went down, so pointerup can tell a tap from a scroll.
  const tapOrigin = useRef<{ x: number; y: number } | null>(null);
  const staggered = revealed && both && Math.abs(a - e) < overlapPct;
  const title =
    `${actual.label} — actual ${a ?? '–'}th pct (${actual.value ?? '–'}), ` +
    `expected ${e ?? '–'}th pct (${expected.value ?? '–'})` +
    (actual.estimated || expected.estimated ? ' · estimated from league avg' : '');
  return (
    <div
      className={`pct-row pct-row-pair${revealed ? ' is-revealed' : ''}`}
      title={title}
      // Mouse hovers reveal; touch/pen taps toggle (hover doesn't exist there).
      // The toggle waits for pointerup within TAP_SLOP of where the finger went
      // down: the card is a list of rows inside a scroller, and toggling on
      // pointerdown meant every flick that happened to start on a row flipped it.
      onPointerEnter={(ev) => ev.pointerType === 'mouse' && setRevealed(true)}
      onPointerLeave={(ev) => ev.pointerType === 'mouse' && setRevealed(false)}
      onPointerDown={(ev) => {
        tapOrigin.current =
          ev.pointerType === 'mouse' ? null : { x: ev.clientX, y: ev.clientY };
      }}
      onPointerUp={(ev) => {
        const start = tapOrigin.current;
        tapOrigin.current = null;
        if (!start) return;
        const moved = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
        if (moved <= TAP_SLOP) setRevealed((r) => !r);
      }}
      // A scroll the browser takes over cancels the pointer without an up.
      onPointerCancel={() => {
        tapOrigin.current = null;
      }}
    >
      {/* At rest the row is the expected stat, so it wears the expected label
          (e.g. "xwOBA"); revealing the dumbbell promotes the actual, so the
          label falls back to the base stat ("wOBA"). */}
      <span className="pct-label">{revealed ? actual.label : expected.label}</span>
      <div className="pct-track">
        {e !== null && (
          <span className="pct-fill" style={{ width: `${e}%`, background: eColor }} />
        )}
        {both && (
          <span
            className="pct-connector pct-actual"
            style={{ left: `${Math.min(a, e)}%`, width: `${Math.abs(a - e)}%` }}
          />
        )}
        {e !== null && (
          <span
            className={`pct-bubble${staggered ? ' pct-bubble--down' : ''}${expected.estimated ? ' pct-bubble--est' : ''}`}
            style={{ left: `${e}%`, background: eColor }}
          >
            {e}
          </span>
        )}
        {a !== null && (
          <span
            className={`pct-bubble pct-bubble-x pct-actual${staggered ? ' pct-bubble--up' : ''}${actual.estimated ? ' pct-bubble--est' : ''}`}
            style={{ left: `${a}%`, color: aColor, borderColor: aColor }}
          >
            {a}
          </span>
        )}
      </div>
      <span className="pct-value pct-value-pair">
        {revealed && a !== null && <span className="pct-value-actual">{actual.value ?? '–'}</span>}
        {/* The "x" only appears once revealed, where it disambiguates the muted
            expected subline from the actual; at rest the label already says so. */}
        <span className="pct-value-expected">
          {revealed ? 'x' : ''}
          {expected.value ?? '–'}
        </span>
      </span>
    </div>
  );
}

/** Render a section's metrics, collapsing each actual/expected pair (when both
 * are present) into a single dumbbell row; everything else stays a normal row. */
function renderMetricRows(metrics: PercentileMetric[], overlapPct: number): ReactElement[] {
  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const consumed = new Set<string>();
  const rows: ReactElement[] = [];
  for (const m of metrics) {
    if (consumed.has(m.key)) continue;
    const xKey = EXPECTED_OF[m.key];
    const expected = xKey ? byKey.get(xKey) : undefined;
    if (expected) {
      consumed.add(xKey);
      rows.push(<PairRow key={m.key} actual={m} expected={expected} overlapPct={overlapPct} />);
    } else {
      rows.push(<MetricRow key={m.key} metric={m} />);
    }
  }
  return rows;
}

/**
 * **Two of these keys were swapped, and the swap is the honest one.** `splits`
 * used to name the tab labelled **Stats** — a leftover from when that tab was
 * the platoon card and nothing else, kept through the rename on the reasoning
 * that a key in no URL is not worth churning. It is worth churning now that a
 * tab called **Splits** exists beside it: two tabs, one of them named after the
 * other's subject, is the kind of thing that reads fine today and is a trap the
 * next time anybody touches this file. So the window table is `stats` and the
 * platoon comparison is `splits`, each named for what it holds.
 *
 * Nothing outside this file had to change but one prop type: the open tab is
 * component state and appears in no URL, and `PlayerOverview`'s `Stats →` link
 * is the only caller (`onTab`), which is a compile error rather than a silent
 * change of behaviour if it is missed.
 *
 * **`rolling` became `charts` on the same reasoning**, and the same check was
 * run rather than assumed: the key is named nowhere outside this file (the tab
 * is state, not a URL param), so the label and the key move together and no
 * link in the wild can be reading it. The tab is `Charts` because it is a place
 * for a chart of the season rather than for one named chart — the card inside
 * it still says `Rolling xwOBA`, which is what that chart *is*.
 */
type DetailsTab =
  | 'overview'
  | 'percentiles'
  | 'splits'
  | 'news'
  | 'stats'
  | 'gamelog'
  | 'arsenal'
  | 'charts';

/**
 * The Arsenal tab: a pitcher's season pitch mix, as the two pictures a Baseball
 * Savant player page leads with — what he throws, and where it moves.
 *
 * **The tab is the charts and nothing else.** It carried a `SplitTabs` row and a
 * `SeasonArsenalRow` per pitch above them for a while, and both were saying
 * again, in a table, what the pictures say better:
 *
 * - The **split tabs** are subsumed by the Pitch Usage chart, which draws vs LHH
 *   and vs RHH side by side *always*. A control that switches the whole tab
 *   between two of the three columns already on screen is a second, narrower way
 *   to ask a question the chart has answered — and it made the movement cloud a
 *   third of itself for no stated reason. (`SplitTabs` itself stays: the pitcher
 *   card's Line and Arsenal sections are its live callers.)
 * - The **per-pitch rows** are the velo/spin/break/results table, which is what
 *   the movement plot, the legend under it and the callouts now carry between
 *   them.
 *
 * The samples are handed over whole for the same reason: with no split control
 * there is nothing to cut them by, and the cloud is the pitcher's season.
 */
function ArsenalTab({ arsenal }: { arsenal: SeasonArsenal }) {
  // The two charts share one selection, so picking out the slider in the usage
  // butterfly picks it out in the movement cloud as well — they are two views of
  // one arsenal, and a selection each would be two answers to "which pitch am I
  // looking at" on one screen.
  const [hovered, setHovered] = useState<string | null>(null);
  if (arsenal.pitches.length === 0) {
    return <div className="details-status">No Statcast pitches this season.</div>;
  }
  return (
    <div className="details-arsenal">
      <div className="arsenal-charts">
        <PitchUsageChart
          season={arsenal.season ?? null}
          pitches={arsenal.pitches}
          vsRight={arsenal.vsRight}
          vsLeft={arsenal.vsLeft}
          hovered={hovered}
          onHover={setHovered}
        />
        <MovementChart
          season={arsenal.season ?? null}
          hand={arsenal.hand ?? null}
          pitches={arsenal.pitches}
          // `?? []` because a response is not a promise: `samples` is declared
          // non-optional and the two `types.ts` are mirrored by hand, so
          // TypeScript cannot catch a server that doesn't send it — and one
          // won't, in the window where a new client is at the edge and the
          // Lambda is still on the older build. Without it that window is not a
          // chart with no dots, it is `undefined.filter` unmounting the whole
          // app (measured against a stale dev server: `#root` went to 0
          // children on the press).
          samples={arsenal.samples ?? []}
          hovered={hovered}
          onHover={setHovered}
        />
      </div>
    </div>
  );
}

/**
 * The portrait at the head of the details view, carrying today's two marks: the
 * lineup pip on the corner — a batting slot, `SP`, a reliever's entry inning —
 * and the status code on the bottom edge, `IL10` or `DTD`.
 *
 * This view opens from everywhere in the app and on anybody, watchlisted or
 * not, which is exactly why it should say them. A user arrives here from a
 * board row to decide something about a player he doesn't follow, and the two
 * questions under every such decision — is he playing today, and is he hurt —
 * were answered by every other view in the app and not by this one. The marks
 * are the same ones the summary table and the board draw, in the same places,
 * scaled to a 64px portrait rather than a 42px row circle. The portrait itself
 * deliberately did not grow when the row circle did: it is a page header rather
 * than a row, sized to the head it sits in, and the two mark sets are each
 * sized to their own circle.
 */
function DetailsPhoto({
  playerId,
  name,
  kind,
}: {
  playerId: number;
  name: string;
  kind: PlayerKind;
}) {
  const status = usePlayerStatus(playerId);
  const badge = useStatusBadge(`${kind}-${playerId}`, status?.rosterStatus ?? null);
  return (
    <span className="details-photo-wrap">
      <img className="details-photo" src={headshotUrl(playerId)} alt={name} />
      <PhotoSpot
        corner={status ? statusCorner(status, kind) : null}
        className="details-photo-spot"
      />
      <PhotoStatus badge={badge} className="details-photo-status" />
    </span>
  );
}

export function PlayerDetails({
  playerId,
  name,
  position,
  isPitcher = false,
  isOnRoster,
  ownedBy,
  rosterEditable = true,
  isWatchlisted,
  onWatchlistToggle,
  rosterPct,
  rosterTrends,
  eligible,
  onAdd,
  onRemove,
  statsColumns,
  onStatsColumnsChange,
  showRanks,
  onShowRanksChange,
  rankPopulations,
  onNeedRankPopulations,
  onOpenDetails,
  onClose,
}: {
  playerId: number;
  name: string;
  position?: string;
  isPitcher?: boolean;
  /** Whether he is on the **roster the app is reporting on** — the saved list,
   *  or the user's ESPN team while `rosterSource` says so. The same key set the
   *  research board's `My Roster` button selects on, so the baseball beside a
   *  row there and the one in this header always mean the same thing. */
  isOnRoster: boolean;
  /** The fantasy team holding him, when it is somebody **else's** in the
   *  connected league — which is what draws the padlock beside his name. Null
   *  when nobody else holds him, and null with no league connected, since
   *  without one there is no ownership to read and the mark is a claim rather
   *  than a decoration. */
  ownedBy?: string | null;
  /** Whether that roster is the app's own to change. False in fantasy mode,
   *  where ESPN owns the list: the add button and the Remove beside the badge
   *  both go, and the badge stays as the plain statement it is. */
  rosterEditable?: boolean;
  /** Whether he is on the user's **watchlist** — the research board's list,
   *  which is a different thing entirely: you watch a player you are thinking
   *  about, and roster the ones you are actually reading every day. */
  isWatchlisted: boolean;
  onWatchlistToggle: (on: boolean) => void;
  /** ESPN's global rostered percentage. `undefined` with no fantasy league
   *  connected, which is what hides the line; `null` when there is one but
   *  ESPN has no figure for this player. */
  rosterPct?: number | null;
  /** How that figure has moved, over every span the server had a baseline for —
   *  the same set the research board draws columns from, and in the same
   *  ascending order. Absent with no league or no history at all; a `change` of
   *  0 is a real answer and is drawn as a flat 0.0 rather than dropped. */
  rosterTrends?: { window: number; days: number; change: number }[];
  /** Every position ESPN has him eligible at — `['2B', 'SS', 'OF']`, and here
   *  including `SP`/`RP`, which the research board's pills deliberately don't
   *  read (see `espnPositions` there). `undefined` with no league; `null` when
   *  there is one and ESPN can't be joined to him, in which case the chip stays
   *  MLB's listed position. This page has the room the board's cell hasn't, so
   *  the list is printed whole. */
  eligible?: string[] | null;
  onAdd: () => void;
  onRemove: () => void;
  /** The **Stats** tab's chosen columns for this kind, or null for its
   *  defaults. Held by App rather than here because this component is unmounted
   *  every time the overlay closes, and a preference that reset per player
   *  would not be one. */
  statsColumns: string[] | null;
  /** null means "back to the defaults", stored as the absence of an entry. */
  onStatsColumnsChange: (keys: string[] | null) => void;
  /** Draw a percentile rank under every value on the **Stats** tab. The same
   *  saved preference the research board's own toggle reads — it is a reading
   *  habit rather than a per-table setting, and the two tables are the one
   *  vocabulary. Held by App for the reason `statsColumns` is. */
  showRanks: boolean;
  onShowRanksChange: (on: boolean) => void;
  /** The research board's rows per window for this kind, as far as App has
   *  them — the population those percentiles are ranked within. Passed through
   *  rather than fetched here, since App is where the board's own cache lives
   *  and this is the same cache. */
  rankPopulations: Partial<Record<string, ResearchRow[]>>;
  onNeedRankPopulations: () => void;
  /**
   * Open another player's page from inside this one — what the Overview tab's
   * scheduled game needs, and the reason this page is navigable at all.
   *
   * That row's dialog draws the opposing starter with a headshot and a name,
   * both of them links, because he is the man a reader has come to the row
   * about and `PlayerDetails` opens on anybody. It was the one caller of
   * `PlayerDay` that never passed a handler, so both links reached
   * `PlayerDay`'s `?? (() => {})` and did **nothing at all** — measured on
   * Soderstrom's page: press either and the URL, the `<h1>` and the dialog are
   * byte-identical afterwards. The default was written when every item here was
   * `grouped` and so drew no identity row; what it missed is that `grouped`
   * drops the *row's own* header and not the block naming the other side's
   * starter, which renders either way.
   */
  onOpenDetails: (key: string) => void;
  onClose: () => void;
}) {
  // This view covers the page but scrolls in its own box, so the list behind it
  // has to be frozen — otherwise the scroll chains straight through and closing
  // the view lands somewhere the user never scrolled to.
  useLockBodyScroll();
  const kind = isPitcher ? 'pitcher' : 'batter';
  const [tab, setTab] = useState<DetailsTab>('overview');

  /**
   * The position chip, in the one vocabulary this page speaks: **what he can
   * be played at** wherever ESPN can say so, and MLB's single listed position
   * otherwise. This is the one place in the app with room for the whole list,
   * which is why the research board's cell may truncate to two codes and this
   * never does — the two read the same fact at two widths.
   *
   * Built once because it is drawn twice: under his name, and again in the game
   * log's own head when that table takes the page and covers this one. A second
   * copy of the rule down there was MLB's position alone, so the same player
   * read `CF` in one head and `OF/DH` in the other depending on which was on
   * screen.
   */
  const posChip =
    eligible && eligible.length > 0 ? (
      <span className="player-pos" title={`Eligible in ESPN at ${eligible.join(', ')}`}>
        {eligible.join('/')}
      </span>
    ) : position ? (
      <span className="player-pos">{position}</span>
    ) : null;

  // Five tabs overflow a phone, so the selected one can sit off the end of the
  // strip — cut in half, or out of sight entirely on a pitcher. Scrolled by
  // hand rather than with `scrollIntoView`, which walks up every scrollable
  // ancestor and would drag the overlay's own scroller with it.
  const tabsRef = useRef<HTMLDivElement | null>(null);
  // The overlay itself: read to ask whether something inside it has taken the
  // page (see the Escape handler below), scrolled back to the top on a tab
  // change (below that), and written to by the offset hook, which publishes the
  // pinned head's height on it for everything inside to clear.
  const viewRef = useRef<HTMLDivElement | null>(null);
  // The keyboard's half of covering the page. This overlay opens from a
  // headshot, a name or a board row, and Tab used to walk from that control
  // straight along the table it was in — measured before the fix, 12 of 12 tab
  // stops behind this page — so a reader could work the roster underneath a
  // player they had opened. Closing hands focus back to the row they pressed.
  // See `hooks.ts::useOverlayFocus`.
  useOverlayFocus(viewRef);
  const chromeRef = useOverlayChromeOffset<HTMLDivElement>(viewRef);
  // Switching tab puts the view back at the top. That is new with the pinned
  // head and is the same rule the research board's own reset follows: the tabs
  // were at the top of the page, so getting to one meant scrolling back up
  // first and a reset came free with having to go there. Reachable from
  // anywhere, they can now be pressed from 1,700px down a percentile card — and
  // what the next tab has at that offset is somebody else's rows, or nothing at
  // all. A tab is a different reading of the player, not a place in one.
  // `playerId` as well as `tab`, and it is a **guard rather than a fix**: a
  // different player is a different page and the offset the last one was read at
  // means nothing on it, but the reset beside this one clears `day`, which
  // unmounts the Overview's whole subtree, which collapses the box and leaves
  // the browser to clamp the offset to 0 on its own. Measured either way at
  // 390×844 — scrolled to 149 on a batter, the pitcher's page opens at 0 with or
  // without the dependency. It is here so the property holds by construction
  // rather than by an accident of what another effect happens to clear.
  useLayoutEffect(() => {
    if (viewRef.current) viewRef.current.scrollTop = 0;
  }, [tab, playerId]);
  useLayoutEffect(() => {
    const row = tabsRef.current;
    const el = row?.querySelector<HTMLElement>('.details-tab.is-active');
    if (!row || !el) return;
    const left = el.offsetLeft - row.offsetLeft;
    const overLeft = left - row.scrollLeft;
    const overRight = left + el.offsetWidth - (row.scrollLeft + row.clientWidth);
    // Land it clear of the edge rather than flush against it, which reads as
    // cut off and hides that there is more strip to swipe to.
    const PEEK = 24;
    if (overLeft < 0) row.scrollLeft += overLeft - PEEK;
    else if (overRight > 0) row.scrollLeft += overRight + PEEK;
  }, [tab]);
  // The Remove button arms on the first tap and commits on the second, as it
  // does on the reorder screen — see RemoveButton. There is no undo.
  const [armedRemove, setArmedRemove] = useState(false);
  // The Overview tab's day. Lazy like the three below it — the difference being
  // that it is the *default* tab, so in practice it loads with the page. That
  // is what the tab is for and it is the cheap half of the two requests the
  // page already makes on open: `getPlayerDay` is one day of one player, and
  // every layer under it is a cache the feed and the boards are already filling.
  const [day, setDay] = useState<PlayerReport | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  // Keyed by kind as well as player, the way the game log's is: a two-way
  // player's bat and his arm are two days, and neither may stand in for the
  // other.
  const dayReq = useRef<string | null>(null);
  const [data, setData] = useState<PlayerPercentiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The season line and platoon splits are fetched here (not passed in) so the
  // details view works for any player, whether or not they're on the watchlist.
  const [splits, setSplits] = useState<{
    season: SeasonStats | null;
    vsLeft: SeasonStats | null;
    vsRight: SeasonStats | null;
  } | null>(null);
  const [pitcherSplits, setPitcherSplits] = useState<{
    season: PitcherSeasonStats | null;
    vsLeft: PitcherSeasonStats | null;
    vsRight: PitcherSeasonStats | null;
  } | null>(null);
  const [splitsError, setSplitsError] = useState<string | null>(null);
  const [splitsLoading, setSplitsLoading] = useState(true);
  // The Stats tab's window table: this player's row on each of the research
  // board's five windows. Lazy on first open like the three heavy tabs below —
  // it is five reads of blobs the warmer already keeps hot, so the cost is a
  // round trip rather than an upstream, but it is a round trip nobody who never
  // opens the tab should pay. Keyed by kind as well as player, the way the game
  // log's is: a two-way player's bat and his arm are two boards.
  const [windows, setWindows] = useState<PlayerWindows | null>(null);
  const [windowsError, setWindowsError] = useState<string | null>(null);
  const [windowsLoading, setWindowsLoading] = useState(false);
  const windowsReq = useRef<string | null>(null);
  // His news. Lazy on first open like the tabs below it — and, like the game
  // log, lazy for the **Overview** too, which previews the top three of the
  // same list. One read serves both, which is what stops the preview and the
  // tab ever showing different items.
  //
  // Keyed by **player alone**, where the day, the log and the window table are
  // keyed by kind as well: news is a fact about a person, so a two-way player
  // has one list rather than two.
  const [news, setNews] = useState<PlayerNews | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const newsReq = useRef<number | null>(null);
  // The season xwOBA series backs the Charts tab's one chart. It's a heavier Savant
  // fetch, so it's loaded lazily — only once that tab is first opened.
  const [xwoba, setXwoba] = useState<XwobaSeries | null>(null);
  const [xwobaError, setXwobaError] = useState<string | null>(null);
  const [xwobaLoading, setXwobaLoading] = useState(false);
  // The season arsenal backs the pitcher-only Arsenal tab — another heavy Savant
  // fetch, so it's lazy in the same way.
  // The season game log backs the Game Log tab — a whole season of rows, so it
  // loads lazily on first open like the two above it.
  const [gameLog, setGameLog] = useState<
    { kind: 'batter'; games: BatterGameLog[] } | { kind: 'pitcher'; games: PitcherGameLog[] } | null
  >(null);
  const [gameLogError, setGameLogError] = useState<string | null>(null);
  const [gameLogLoading, setGameLogLoading] = useState(false);
  const [arsenal, setArsenal] = useState<SeasonArsenal | null>(null);
  const [arsenalError, setArsenalError] = useState<string | null>(null);
  const [arsenalLoading, setArsenalLoading] = useState(false);
  const arsenalReq = useRef<number | null>(null);
  const xwobaReq = useRef<number | null>(null);
  // Keyed by kind as well as player: a two-way player's two logs are two
  // different requests, and the batter's must not stand in for the pitcher's.
  const gameLogReq = useRef<string | null>(null);

  /**
   * Each tab's read, held back by `WAIT_DELAY` before it is allowed to say so.
   *
   * Five tabs, five fetches, and the same rule for all of them: a percentile
   * card the server already has comes back in a few tens of milliseconds, and
   * a wait that appears and vanishes inside a tenth of a second reads as the
   * page breaking rather than as an answer. Held here rather than inside
   * `LoadingBlock` because the *content* must go on being gated on the real
   * flag — a tab that showed nothing while its read was still in flight would
   * be a blank pane instead of a wait.
   */
  const pctWait = useDelayedFlag(loading);
  const splitsWait = useDelayedFlag(splitsLoading);
  const windowsWait = useDelayedFlag(windowsLoading);
  const xwobaWait = useDelayedFlag(xwobaLoading);
  const gameLogWait = useDelayedFlag(gameLogLoading);
  const arsenalWait = useDelayedFlag(arsenalLoading);
  const dayWait = useDelayedFlag(dayLoading);

  // The percentile-point distance below which two paired bubbles would overlap,
  // measured from the live track width (~a bubble diameter's worth of the rail)
  // so the stagger threshold stays correct across desktop and mobile widths.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [overlapPct, setOverlapPct] = useState(8);
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const track = card.querySelector('.pct-track');
      const w = track?.clientWidth ?? 0;
      if (w > 0) setOverlapPct(Math.min(40, (23 / w) * 100)); // 23px ≈ bubble + breathing room
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    return () => ro.disconnect();
  }, [data]);

  // Close on Escape, matching a modal/back affordance — unless something is on
  // top of this view, in which case the key is that thing's to answer. Two
  // shapes of "on top" and they need different tests. A **descendant** that has
  // taken the page is the game log's full-page box, which lives inside this
  // overlay and so is found by reading our own subtree (`hooks.ts::useFullPage`
  // declines the key from the other side, when *this* view is the one above).
  // A **portalled** one is a `Modal` opened from in here — a Game Log row's
  // per-game popup — which is nobody's descendant and is caught by the shared
  // stacking test instead. One press, one thing undone, either way round.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Before the claim, not after: a box that declines the key must not have
      // taken the press with it (see `answersEscape`).
      if (viewRef.current?.querySelector('.is-expanded')) return;
      if (!answersEscape(e, viewRef.current)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .percentiles(playerId, kind)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [playerId, kind]);

  useEffect(() => {
    let live = true;
    setSplitsLoading(true);
    setSplitsError(null);
    setSplits(null);
    setPitcherSplits(null);
    const req = isPitcher
      ? api.pitcherSplits(playerId).then((d) => {
          if (live) setPitcherSplits(d);
        })
      : api.splits(playerId).then((d) => {
          if (live) setSplits(d);
        });
    req
      .catch((e: unknown) => {
        if (live) setSplitsError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (live) setSplitsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [playerId, isPitcher]);

  // Reset the (lazily-loaded) rolling series when the player changes.
  //
  // **And the tab with them, which this page only now has to answer for.** Until
  // the Overview's scheduled game gained a working link there was no way for
  // `playerId` to change while the page was open — every route in opened it and
  // every route out closed it — so the tab could only ever belong to the player
  // on screen.
  //
  // It is a **guard rather than a fix**, and the honest version is worth saying:
  // the one link that changes the player lives in the Overview tab's own
  // dialog, so `tab` is already `overview` whenever it fires and the reset is a
  // no-op today (measured — the tab reads `Overview` before and after, on both
  // kinds). What it defends against is the next link somewhere else, where
  // carrying a tab across would be wrong in a way the reader cannot undo:
  // `arsenal` renders its button only for a pitcher, so carrying it onto a
  // batter leaves a page with no tab selected and nothing under it, every block
  // below being gated on an `arsenal` this very effect has just cleared.
  // Overview is where the page opens on everybody, and a new player is a new
  // page.
  useEffect(() => {
    setTab('overview');
    xwobaReq.current = null;
    setXwoba(null);
    setXwobaError(null);
    arsenalReq.current = null;
    setArsenal(null);
    setArsenalError(null);
    gameLogReq.current = null;
    setGameLog(null);
    setGameLogError(null);
    dayReq.current = null;
    setDay(null);
    setDayError(null);
    windowsReq.current = null;
    setWindows(null);
    setWindowsError(null);
    newsReq.current = null;
    setNews(null);
    setNewsError(null);
  }, [playerId]);

  // The Overview tab's day, lazily on first open (which for this tab is the
  // page opening). No date is sent: the server's own baseball day is the one
  // definition of "today" the app should have, and a tab left open past the 3am
  // rollover would otherwise keep asking for yesterday.
  useEffect(() => {
    const req = `${kind}-${playerId}`;
    if (tab !== 'overview' || dayReq.current === req) return;
    dayReq.current = req;
    let live = true;
    setDayLoading(true);
    setDayError(null);
    api
      .playerDay(playerId, kind)
      .then((d) => {
        if (live) setDay(d.player);
      })
      .catch((e: unknown) => {
        if (live) {
          setDayError(e instanceof Error ? e.message : 'Failed to load');
          dayReq.current = null; // allow a retry on re-open
        }
      })
      .finally(() => {
        if (live) setDayLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab, playerId, kind]);

  // The Stats tab's five window rows, lazily on first open.
  useEffect(() => {
    const req = `${kind}-${playerId}`;
    if (tab !== 'stats' || windowsReq.current === req) return;
    windowsReq.current = req;
    let live = true;
    setWindowsLoading(true);
    setWindowsError(null);
    api
      .playerWindows(playerId, kind)
      .then((d) => {
        if (live) setWindows(d);
      })
      .catch((e: unknown) => {
        if (live) {
          setWindowsError(e instanceof Error ? e.message : 'Failed to load');
          windowsReq.current = null; // allow a retry on re-open
        }
      })
      .finally(() => {
        if (live) setWindowsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab, playerId, kind]);

  // Same lazy load for the Game Log tab — and for the **Overview**, which draws
  // the last five of its rows. One read serves both, which is the point of
  // hanging it here rather than inside the preview: crossing from the summary to
  // the full log is then free, and the two can never show different rows.
  useEffect(() => {
    const req = `${kind}-${playerId}`;
    if ((tab !== 'gamelog' && tab !== 'overview') || gameLogReq.current === req) return;
    gameLogReq.current = req;
    let live = true;
    setGameLogLoading(true);
    setGameLogError(null);
    (isPitcher ? api.pitcherGameLog(playerId) : api.gameLog(playerId))
      .then((d) => {
        if (live) setGameLog(d);
      })
      .catch((e: unknown) => {
        if (live) {
          setGameLogError(e instanceof Error ? e.message : 'Failed to load');
          gameLogReq.current = null; // allow a retry on re-open
        }
      })
      .finally(() => {
        if (live) setGameLogLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab, playerId, isPitcher, kind]);

  // The News tab's items, and the Overview's preview of them. One read for
  // both, the rule the game log above it follows and for the same reason: the
  // preview is the top of this very list, so two reads could show two lists.
  useEffect(() => {
    if ((tab !== 'news' && tab !== 'overview') || newsReq.current === playerId) return;
    newsReq.current = playerId;
    let live = true;
    setNewsLoading(true);
    setNewsError(null);
    api
      .playerNews(playerId)
      .then((d) => {
        if (live) setNews(d);
      })
      .catch((e: unknown) => {
        if (live) {
          setNewsError(e instanceof Error ? e.message : 'Failed to load');
          newsReq.current = null; // allow a retry on re-open
        }
      })
      .finally(() => {
        if (live) setNewsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab]);

  // Same lazy load for the Arsenal tab.
  useEffect(() => {
    if (tab !== 'arsenal' || arsenalReq.current === playerId) return;
    arsenalReq.current = playerId;
    let live = true;
    setArsenalLoading(true);
    setArsenalError(null);
    api
      .arsenal(playerId)
      .then((d) => {
        if (live) setArsenal(d);
      })
      .catch((e: unknown) => {
        if (live) {
          setArsenalError(e instanceof Error ? e.message : 'Failed to load');
          arsenalReq.current = null; // allow a retry on re-open
        }
      })
      .finally(() => {
        if (live) setArsenalLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab]);

  // Fetch the season xwOBA series the first time the Charts tab is opened for
  // this player (xwobaReq tracks which player we've already requested).
  useEffect(() => {
    if (tab !== 'charts' || xwobaReq.current === playerId) return;
    xwobaReq.current = playerId;
    let live = true;
    setXwobaLoading(true);
    setXwobaError(null);
    api
      .xwoba(playerId, kind)
      .then((d) => {
        if (live) setXwoba(d);
      })
      .catch((e: unknown) => {
        if (live) {
          setXwobaError(e instanceof Error ? e.message : 'Failed to load');
          xwobaReq.current = null; // allow a retry on re-open
        }
      })
      .finally(() => {
        if (live) setXwobaLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tab, playerId, kind]);

  return (
    // The Game Log makes the overlay a fixed-height column so only its table
    // scrolls — see `.details-view.gamelog-mode`, which is the only way its
    // header row can stick over a season's worth of rows.
    //
    // The provider declares this box's own layer for anything opened from
    // inside it — the Game Log's per-game popup, which is portalled to the body
    // and so has no other way of knowing it must clear a page at 50. See
    // `Modal.tsx::DialogLayerContext`.
    <DialogLayerContext.Provider value={OVERLAY_LAYER}>
    <div ref={viewRef} tabIndex={-1} className={`details-view${tab === 'gamelog' ? ' gamelog-mode' : ''}`}>
      {/* The head and the tabs are one pinned box, held at the top of this
          overlay's own scroller — see `.details-chrome`. They are one statement
          of who is being read and which reading of him, which is the argument
          `.app-chrome` makes a level up for the header, the search and the view
          bar. */}
      <div className="details-chrome" ref={chromeRef}>
        <div className="details-head">
          <BackButton onClose={onClose} />
          <div className="details-id">
            <DetailsPhoto playerId={playerId} name={name} kind={kind} />
            <div>
              <h1 className="details-name">
                {name}
                {/* ESPN's eligibility where there is a league to read it from,
                    MLB's listed position otherwise — see `posChip`. */}
                {posChip}
                {/* The padlock: somebody else in the league already has him.
                    It sits on the **name line** rather than out in the control
                    cluster on the right, for the reason the Rostered line under
                    it does — that cluster is things you *do* to him, where this
                    is a fact *about* him, like the position chip it follows.

                    It is the glyph alone, where the `Watch` button beside it
                    keeps its word: that one is a verb naming what a press does,
                    and this is a label whose words ("on another manager's team
                    in your ESPN league") are longer than an `<h1>` can spare and
                    are exactly what the tooltip already says.

                    Suppressed when he is on the roster in view — the badge
                    below is the answer then, and the two would be one question
                    answered twice. In fantasy mode that case cannot even arise,
                    the user's own team being excluded upstream. */}
                {!isOnRoster && ownedBy && <LockMark name={name} team={ownedBy} size={15} />}
                {/* And the newspaper, on the name line for the reason the lock
                    is: a fact *about* him, where the cluster on the right is
                    things you do to him. This is the page the News tab is on,
                    so the mark is the door-knocker — and it is drawn whether or
                    not he is on the roster, having nothing to do with whose he
                    is. 15px, matching the star and the lock beside it rather
                    than the 13 a table row gives them. */}
                <PlayerNewsMark id={playerId} name={name} size={15} />
              </h1>
              {/* Under the name rather than out beside the watchlist button: it
                  is a fact *about the player*, like the position chip above it,
                  where the buttons on the right are things you do to him. Absent
                  entirely without a fantasy league — and dashed rather than
                  hidden when there is one but ESPN has no figure for him, since
                  on a connected account a missing number is information. */}
              {rosterPct !== undefined && (
                <p
                  className="details-rostered"
                  title="Rostered in this share of all ESPN leagues — ESPN's own figure, not your league's"
                >
                  Rostered{' '}
                  <strong>{rosterPct === null ? '—' : `${rosterPct.toFixed(1)}%`}</strong>
                  {/* One span per column the board can draw, in the same order,
                      so the page and the table agree about what is available.
                      Each states its own span rather than the sentence a single
                      trend used to read ("▲ 1.2 in 7d"): five of those is a
                      paragraph, where the span up front and the move behind it
                      is a row that can be scanned across. A flat window keeps
                      its 0.0 in the muted colour — the server drops zeroes from
                      the wire and the client fills them back, so flat is a real
                      answer here and not an absence. */}
                  {rosterPct !== null && rosterTrends && rosterTrends.length > 0 && (
                    <span className="details-trends">
                      {rosterTrends.map((t) => (
                        <span
                          key={t.window}
                          className={`details-trend${
                            t.change > 0 ? ' up' : t.change < 0 ? ' down' : ''
                          }`}
                          title={`Change over the last ${t.days} day${t.days === 1 ? '' : 's'}`}
                        >
                          <span className="details-trend-span">{t.days}d</span>
                          {t.change === 0
                            ? '0.0'
                            : `${t.change > 0 ? '▲' : '▼'}${Math.abs(t.change).toFixed(1)}`}
                        </span>
                      ))}
                    </span>
                  )}
                </p>
              )}
              <a
                className="details-savant-link"
                href={savantPlayerUrl(name, playerId)}
                target="_blank"
                rel="noreferrer"
              >
                View on Baseball Savant ↗
              </a>
            </div>
          </div>
          {/* Two controls over two different lists, and the header is where the
              app has to make that distinction plainest — this page opens on
              anybody, and "am I following this man, and in which sense" is the
              question it exists to settle. The **star** is the watchlist and is
              always there, on or off, in every mode: that list is the user's own
              and has nothing to do with where the roster comes from. The
              **roster** control beside it is either an add button or the "On
              roster" mark with its remove beside it — and in fantasy mode it is
              neither, ESPN owning the list; see the badge below. */}
          <div className="details-watch-actions">
            <button
              type="button"
              className={`details-watch-star${isWatchlisted ? ' on' : ''}`}
              aria-pressed={isWatchlisted}
              onClick={() => onWatchlistToggle(!isWatchlisted)}
              title={
                isWatchlisted
                  ? `Remove ${name} from your watchlist`
                  : `Add ${name} to your watchlist — the research board can be narrowed to it`
              }
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill={isWatchlisted ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9Z" />
              </svg>
              {isWatchlisted ? 'Watching' : 'Watch'}
            </button>
          {isOnRoster ? (
            <>
              {/* The app's baseball, the same mark the research board's watched
                  rows carry — a tick is what a form says when it accepts a value,
                  where this is a state the player is in. It survives into fantasy
                  mode because it is *true there*: the roster on screen is the
                  ESPN team, and this man is on it. The wording is the same in
                  both modes on purpose — the board's button is still `My Roster`
                  and its baseball still marks these same keys, so a second name
                  for one fact would only invite the reader to look for a
                  difference that isn't there. Which list it is, is the title's
                  business. */}
              <span
                className="details-watch-badge"
                title={
                  rosterEditable
                    ? `${name} is on your roster`
                    : `${name} is on your fantasy team — the roster the Summary, Games and Feed views are reading`
                }
              >
                <BaseballMark size={12} width={2} />
                On roster
              </span>
              {/* But the Remove goes with the mode: ESPN's list is not ours to
                  take a player off, and a ✕ that either did nothing or quietly
                  edited the *saved* list — the one nothing on screen is showing —
                  is the plainest version of a control offering what it can't do.
                  Dropping him is a move made on ESPN. */}
              {rosterEditable && (
                <RemoveButton
                  name={name}
                  armed={armedRemove}
                  onArm={() => setArmedRemove(true)}
                  onRemove={onRemove}
                />
              )}
            </>
          ) : rosterEditable ? (
            <button
              type="button"
              className="details-add"
              onClick={onAdd}
              title={`Add ${name} to your roster — the Summary, Games and Feed views then report on him`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add to roster
            </button>
          ) : null}
          </div>
        </div>

        <div className="details-tabs" role="tablist" ref={tabsRef}>
          {/* First and default: what he is doing today, which is the question
              this page is opened with on a game day. The rest are readings of
              his season, and they run pictures-before-numbers — the percentile
              card, the arsenal (pitchers) and the splits, then the news, the
              stats and the games. */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'overview'}
            className={`details-tab${tab === 'overview' ? ' is-active' : ''}`}
            onClick={() => setTab('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'percentiles'}
            className={`details-tab${tab === 'percentiles' ? ' is-active' : ''}`}
            onClick={() => setTab('percentiles')}
          >
            Percentile Rankings
          </button>
          {/* **Arsenal is third on a pitcher, directly after the percentile
              card**, where it used to trail the Game Log. It is the same
              argument that put Splits there: the card and these two charts are
              both a picture of *what kind of pitcher this is* — what he throws
              and where it moves — where Stats and the Game Log are the numbers
              he has put up. A reader deciding about a stranger takes the
              pictures first, and for a pitcher the arsenal is the picture. It
              also stops the one pitcher-only tab being the one furthest along a
              strip that scrolls on a phone. */}
          {isPitcher && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'arsenal'}
              className={`details-tab${tab === 'arsenal' ? ' is-active' : ''}`}
              onClick={() => setTab('arsenal')}
            >
              Arsenal
            </button>
          )}
          {/* **Splits reads with the percentile card (and, on a pitcher, the
              Arsenal), where it used to read after Stats.** The old order was
              the order the season is *cut* in — the whole of it, then the same season cut by handedness,
              then the games it is made of — and this one is the order the two
              are *read* in: the percentile card and the splits are both a
              picture of what kind of player he is, where Stats and the Game Log
              are the numbers. Putting the two pictures together means a reader
              deciding about a stranger takes both without passing a table in
              between. It is still its own tab rather than the foot of the one
              beside it, because a platoon split is a *comparison* rather than a
              table — see `PlatoonSplits.tsx`. */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'splits'}
            className={`details-tab${tab === 'splits' ? ' is-active' : ''}`}
            onClick={() => setTab('splits')}
          >
            Splits
          </button>
          {/* **News reads before Stats and the Game Log**, which is the same
              order the Overview's blocks are in and for the same reason: the
              news is what has happened to him *this week* — an IL placement, a
              call-up, a report he is losing a job — where Stats and the Game
              Log are the record of what he has done. A reader deciding about a
              stranger wants to know he is hurt before reading his 30-day
              xwOBA. */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'news'}
            className={`details-tab${tab === 'news' ? ' is-active' : ''}`}
            onClick={() => setTab('news')}
          >
            News
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'stats'}
            className={`details-tab${tab === 'stats' ? ' is-active' : ''}`}
            onClick={() => setTab('stats')}
          >
            Stats
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'gamelog'}
            className={`details-tab${tab === 'gamelog' ? ' is-active' : ''}`}
            onClick={() => setTab('gamelog')}
          >
            Game Log
          </button>
          {/* **`Charts`, where this read `Rolling xwOBA`.** The strip names the
              *kind* of reading a tab holds — Overview, Splits, Stats, Game Log —
              and this was the one entry naming a single card instead, which is
              also the longest label on a strip a phone already scrolls. The card
              inside it still says `Rolling xwOBA · 2026`, so nothing is lost:
              the tab says which kind of reading, the card says which reading. */}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'charts'}
            className={`details-tab${tab === 'charts' ? ' is-active' : ''}`}
            onClick={() => setTab('charts')}
          >
            Charts
          </button>
        </div>
      </div>

      {tab === 'overview' && dayWait && <LoadingBlock>Reading today&rsquo;s game</LoadingBlock>}
      {tab === 'overview' && dayError && !dayLoading && (
        <div className="details-status details-error">Couldn&rsquo;t load today: {dayError}</div>
      )}
      {tab === 'overview' && day && !dayLoading && (
        <OverviewTab
          report={day}
          playerId={playerId}
          name={name}
          /* The season line and the game log are the page's own reads, handed
             down rather than fetched again: the Stats tab and the Game Log tab
             already hold them, and a second copy would be a second answer free
             to disagree with the tab it summarises. */
          season={splits?.season ?? null}
          pitcherSeason={pitcherSplits?.season ?? null}
          seasonLoading={splitsLoading}
          gameLog={gameLog}
          gameLogLoading={gameLogLoading}
          news={news}
          newsLoading={newsLoading}
          onTab={setTab}
          onOpenDetails={onOpenDetails}
        />
      )}

      {tab === 'news' && (
        <NewsTab news={news} loading={newsLoading} error={newsError} name={name} />
      )}

      {tab === 'arsenal' && arsenalWait && <LoadingBlock>Reading the season arsenal</LoadingBlock>}
      {tab === 'arsenal' && arsenalError && !arsenalLoading && (
        <div className="details-status details-error">⚠ {arsenalError}</div>
      )}
      {tab === 'arsenal' && arsenal && !arsenalLoading && (
        <ArsenalTab arsenal={arsenal} />
      )}

      {tab === 'gamelog' && gameLogWait && <LoadingBlock>Reading the game log</LoadingBlock>}
      {tab === 'gamelog' && gameLogError && !gameLogLoading && (
        <div className="details-status details-error">
          Couldn’t load the game log: {gameLogError}
        </div>
      )}
      {tab === 'gamelog' && gameLog && !gameLogLoading && (
        <GameLog
          {...gameLog}
          /* A row opens that game as a feed, which is a fetch of its own — so
             the log has to know whose season it is drawing rather than only
             what is in it. */
          playerId={playerId}
          name={name}
          /* Expanded, this table covers the head that says whose season it is.
             A face and a name put that back at a size that belongs above a
             table rather than at the top of a page. */
          chrome={
            <span className="glog-id">
              <img className="glog-id-photo" src={headshotUrl(playerId)} alt="" />
              {name}
              {posChip}
            </span>
          }
        />
      )}

      {tab === 'charts' && xwobaWait && <LoadingBlock>Reading the season&rsquo;s plate appearances</LoadingBlock>}
      {tab === 'charts' && xwobaError && !xwobaLoading && (
        <div className="details-status details-error">
          Couldn’t load xwOBA: {xwobaError}
        </div>
      )}
      {tab === 'charts' && xwoba && !xwobaLoading && (
        <RollingXwoba series={xwoba} name={name} />
      )}

      {/* **The Stats tab: the research board, transposed.** The five spans the
          board itself offers, down the side, under the board's own columns — so
          "how has he been going lately, against his season" is one read rather
          than five visits to a league table. The platoon card that used to sit
          under it is the tab beside it now: the same season cut by handedness
          rather than by time, which is a different question and reads as a
          comparison rather than as a table. */}
      {tab === 'stats' && windowsWait && <LoadingBlock>Reading the stat lines</LoadingBlock>}
      {tab === 'stats' && windowsError && !windowsLoading && (
        <div className="details-status details-error">
          Couldn’t load stats: {windowsError}
        </div>
      )}
      {/* The table is a direct child of the view, as the game log is, so
          `--table-bleed` takes it out to the overlay's own edges rather than
          leaving it inside a reading column's padding. Its Columns button sits
          above it and keeps the gutters, the way the research board's count
          line does.

          **There is no line of explanation over it any more.** It read "The
          research board's own columns, one row per span" — which named the page
          the columns came *from* rather than saying anything about the table
          under it, and did so on a tab whose whole job is five rows and a
          header. The spans are written out in the first column and the columns
          are the app's own, so the sentence was telling a reader what they were
          already looking at, in the slot the control now uses. */}
      {tab === 'stats' && windows && !windowsLoading && (
        <PlayerWindowTable
          kind={kind}
          windows={windows.windows}
          columnKeys={statsColumns}
          onColumnsChange={onStatsColumnsChange}
          showRanks={showRanks}
          onShowRanksChange={onShowRanksChange}
          populations={rankPopulations}
          onNeedPopulations={onNeedRankPopulations}
        />
      )}

      {/* **The Splits tab: the two halves of the platoon, against each other.**
          The read is the page's own eager one — the same `/api/players/:id/splits`
          the Overview's season line already waits on — so this tab costs no
          request of its own and is never the first thing on screen to be
          waiting. */}
      {tab === 'splits' && splitsWait && <LoadingBlock>Reading the platoon splits</LoadingBlock>}
      {tab === 'splits' && splitsError && !splitsLoading && (
        <div className="details-status details-error">
          Couldn’t load platoon splits: {splitsError}
        </div>
      )}
      {tab === 'splits' && !splitsLoading && isPitcher && pitcherSplits && (
        <PitcherSplitsTab vsLeft={pitcherSplits.vsLeft} vsRight={pitcherSplits.vsRight} />
      )}
      {tab === 'splits' && !splitsLoading && !isPitcher && splits && (
        <BatterSplitsTab vsLeft={splits.vsLeft} vsRight={splits.vsRight} />
      )}

      {tab === 'percentiles' && pctWait && <LoadingBlock>Reading the percentile card</LoadingBlock>}
      {tab === 'percentiles' && error && !loading && (
        <div className="details-status details-error">
          Couldn’t load percentile rankings: {error}
        </div>
      )}
      {tab === 'percentiles' && data && !loading && (
        <div className="pct-card" ref={cardRef}>
          <div className="pct-card-head">
            <span className="pct-card-title">{data.year} MLB Percentile Rankings</span>
          </div>
          {data.sections.map((sec) => (
            <div className="pct-section" key={sec.title}>
              <h2 className="pct-section-title">{sec.title}</h2>
              {renderMetricRows(sec.metrics, overlapPct)}
            </div>
          ))}
          {data.sections.length === 0 && (
            <div className="details-status">No Statcast data for this player.</div>
          )}
        </div>
      )}
    </div>
    </DialogLayerContext.Provider>
  );
}
