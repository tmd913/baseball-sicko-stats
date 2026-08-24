import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { api } from '../api';
import type {
  BatterGameLog,
  GameLogGap,
  PitcherGameLog,
  PitcherSeasonStats,
  PlayerPercentiles,
  PercentileMetric,
  PlayerKind,
  PlayerNews,
  PlayerReport,
  PlayerWindows,
  ProjectedStarts,
  ResearchRow,
  ScheduleWindow,
  SeasonArsenal,
  SeasonStats,
  SplitCut,
  XwobaSeries,
} from '../types';
import { handCell, headshotUrl, isRotationStarter, savantPlayerUrl, statusCorner } from '../lib';
import {
  MovementChart,
  PitchUsageChart,
  seasonChartPitches,
  usePitchSelection,
} from './ArsenalCharts';
import { RemoveButton } from './RemoveButton';
import { DetailsShell, DetailsTabButton } from './DetailsShell';
import { PhotoSpot, PhotoStatus, useStatusBadge } from './PhotoStatus';
import { TeamMark } from './PlayerIdentity';
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
  TAP_SLOP,
  useDelayedFlag,
  usePlayerStatus,
  useHandedness,
} from '../hooks';
import { OverviewTab } from './PlayerOverview';
import { PlayerScheduleTab } from './PlayerSchedule';
import type { PitcherLookup } from './schedule';

/**
 * Savant's diverging percentile scale: deep blue (poor, 0) → neutral gray
 * (average, 50) → red (great, 100). The bubble is filled solid at this color
 * and carries the percentile number in white, so identity never rests on hue
 * alone; the bar behind it is the same color at reduced opacity. The gray
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
 * used to name the tab labeled **Stats** — a leftover from when that tab was
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
 * change of behavior if it is missed.
 *
 * **`rolling` became `charts` on the same reasoning**, and the same check was
 * run rather than assumed: the key is named nowhere outside this file (the tab
 * is state, not a URL param), so the label and the key move together and no
 * link in the wild can be reading it. The tab is `Charts` because it is a place
 * for a chart of the season rather than for one named chart — the card inside
 * it still says `Rolling xwOBA`, which is what that chart *is*.
 */
/**
 * **A tab is a key, never an index**, which is what made reordering the strip a
 * one-place change: the strip's order is the order the buttons are written in
 * and nothing anywhere stores a position. The key is not in the URL either (the
 * tab is state, not a param — see the paragraph above), and the reorder screen
 * `PlayerOrderEditor` is about the order of *players* on a roster, so it has no
 * opinion about this. The union below is written in strip order for reading,
 * and that is all it is.
 */
type DetailsTab =
  | 'overview'
  | 'arsenal'
  | 'percentiles'
  | 'splits'
  | 'news'
  | 'stats'
  | 'gamelog'
  | 'schedule'
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
  /**
   * The two charts share one selection, so picking out the slider in the usage
   * butterfly picks it out in the movement cloud as well — they are two views of
   * one arsenal, and a selection each would be two answers to "which pitch am I
   * looking at" on one screen.
   *
   * **The whole of it lives in `usePitchSelection`**, which is where an outing's
   * own copy of these two charts reads it from too. It was written out here
   * while there was one caller, and every line of it — the preview/pin split, a
   * leave that only clears its own, a press elsewhere that unpins, and the
   * `TAP_SLOP` release test that keeps a scroll from counting as one — is a rule
   * about the gesture rather than about this tab. Two copies of that would be
   * two chances for a page and an outing to answer the same finger differently.
   */
  const selection = usePitchSelection();
  // The charts read a `ChartPitch` — a pitch, its numbers, and whatever baseline
  // it is drawn against — rather than this payload's own row, so that the same
  // two pictures can be drawn for one game against his season. See `ChartPitch`.
  const pitches = useMemo(() => seasonChartPitches(arsenal.pitches), [arsenal.pitches]);
  const vsRight = useMemo(
    () => (arsenal.vsRight ? seasonChartPitches(arsenal.vsRight) : null),
    [arsenal.vsRight],
  );
  const vsLeft = useMemo(
    () => (arsenal.vsLeft ? seasonChartPitches(arsenal.vsLeft) : null),
    [arsenal.vsLeft],
  );

  if (arsenal.pitches.length === 0) {
    return <div className="details-status">No Statcast pitches this season.</div>;
  }
  return (
    <div className="details-arsenal">
      <div className="arsenal-charts">
        <PitchUsageChart
          season={arsenal.season ?? null}
          pitches={pitches}
          vsRight={vsRight}
          vsLeft={vsLeft}
          selection={selection}
        />
        <MovementChart
          season={arsenal.season ?? null}
          hand={arsenal.hand ?? null}
          armAngle={arsenal.armAngle ?? null}
          pitches={pitches}
          // `?? []` because a response is not a promise: `samples` is declared
          // non-optional and the two `types.ts` are mirrored by hand, so
          // TypeScript cannot catch a server that doesn't send it — and one
          // won't, in the window where a new client is at the edge and the
          // Lambda is still on the older build. Without it that window is not a
          // chart with no dots, it is `undefined.filter` unmounting the whole
          // app (measured against a stale dev server: `#root` went to 0
          // children on the press).
          samples={arsenal.samples ?? []}
          selection={selection}
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

/**
 * **Who he plays for, and the door to them** — under the portrait, in the
 * page's own head rather than on the Overview tab where it began.
 *
 * It is the same fact the portrait beside it is: a standing description of the
 * man, like the position chip and the hand on the line under his name, where
 * everything on the Overview below is a *reading* of him. Under the portrait
 * because that is what the cap logo on it is already saying — the club is a
 * property of the picture, not a line of the page — and because a chip leading
 * the Overview was on one tab of nine, so a reader on Splits or Game Log who
 * wanted the lineup around him had to go back to the tab he had left.
 *
 * The move takes it out of the tab's reading column and off the page's
 * scroller, which is why it no longer needs `.ovw-team-row`'s cap: the head is
 * already a centered 680px box and the chip is inside it.
 *
 * **The box is reserved rather than drawn on arrival.** `report` is the day
 * read, which lands a second or so after the page opens, and this head is
 * pinned chrome over a scroller — a chip that appeared would push the whole
 * page down under the reader's finger. So the ghost holds the height, exactly
 * as `.details-sub-ghost` does one line over for the position chip, and a free
 * agent — whom MLB files under no club, the join-to-null rule — keeps the space
 * and gets no link.
 */
function TeamDoor({
  report,
  onOpenTeam,
}: {
  /** His day, or null while the read is still out. */
  report: PlayerReport | null;
  onOpenTeam: (teamId: number) => void;
}) {
  const teamId = report?.teamId ?? null;
  if (teamId === null) {
    return (
      /* The ghost is the **whole chip**, not a blank of its height: this column
         is what sets its own width, so a narrower placeholder would slide the
         name and everything under it sideways the moment the club landed
         (measured, before it was: 64 → 82, an 18px jump). Same logo box, same
         arrow, and a three-letter abbreviation, which is the widest MLB has —
         which leaves the ghost at 87 against a real 82 (`LAD`) or 83 (`NYY`),
         so what is left of the jump is the width of two glyphs. */
      <span className="details-team details-team-ghost" aria-hidden="true">
        <span className="row-id-logo" />
        <span className="details-team-name">WSH</span>
        <span className="details-team-go">&rarr;</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="details-team"
      onClick={() => onOpenTeam(teamId)}
      title={`${report?.team ?? 'His club'} — the club’s page`}
    >
      <TeamMark teamId={teamId} team={report?.team ?? ''} />
      <span className="details-team-name">{report?.team ?? 'His club'}</span>
      {/* The app's own `News →` / `Stats →` device: what a reader already knows
          means "this changes what is on screen". */}
      <span className="details-team-go" aria-hidden="true">
        &rarr;
      </span>
    </button>
  );
}

export function PlayerDetails({
  playerId,
  name,
  position,
  isPitcher = false,
  twoWay = false,
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
  statsCut,
  onStatsCutChange,
  rankPopulations,
  onNeedRankPopulations,
  onOpenDetails,
  onOpenTeam,
  onClose,
  scheduleWindow,
  scheduleError,
  onNeedSchedule,
  pitcherLookup,
}: {
  playerId: number;
  name: string;
  position?: string;
  isPitcher?: boolean;
  /**
   * **Whether this man has a page on the other side of the ball too**, which is
   * the whole of what the Batting/Pitching switch is gated on.
   *
   * A two-way player is **two rows under one id** everywhere else in the app —
   * two lines on the roster's two tables, two research-board rows, two
   * watchlist entries — and so, since this page opens on a `${kind}-${id}` key,
   * two pages. That was reachable only from two different rows on two different
   * tables until the switch: a reader who had arrived at Ohtani's bat had no way
   * to his arm but to close the page and go find the other row.
   *
   * False for everybody else, and it must be: a control offering `Pitching` on
   * a man with no pitching page is a control that navigates to nothing.
   */
  twoWay?: boolean;
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
  /** How that figure has moved, over each span the server had a baseline for,
   *  in ascending order. **The three short ones** — `App` cuts the board's own
   *  five down to `1d 3d 7d` on the way in, this line being a header rather
   *  than a column to scan down; see there. Absent with no league or no history
   *  at all; a `change` of 0 is a real answer and is drawn as a flat 0.0 rather
   *  than dropped. */
  rosterTrends?: { window: number; days: number; change: number | null }[];
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
  /** **Which cut of the spans the Stats tab is showing**, or null for all of
   *  them — `cut=` in the URL, since it is which data the table shows rather
   *  than how it is read. Held by App for the reason `statsColumns` is, and
   *  because a URL parameter has to outlive the overlay that draws it. */
  statsCut: SplitCut | null;
  onStatsCutChange: (cut: SplitCut | null) => void;
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
  /** …and his **club's** page, from the chip under the portrait — the one fact
   *  the day report has always carried and could not act on. See `TeamDoor`. */
  onOpenTeam: (teamId: number) => void;
  onClose: () => void;
  /**
   * The league-wide schedule window the **Schedule** tab draws a batter's or a
   * reliever's fixtures from, handed down rather than fetched here.
   *
   * It takes no parameters — one window for every club and every player — so it
   * is read once per session and shared, and this page is the third surface to
   * ask for it after the two wide tables' Schedule view and the matchup page's
   * team pages. `onNeedSchedule` is how a surface that does not own the span
   * asks; the tab calls it on first open and only where it is going to draw
   * something with it (a rotation starter's rows come off his own route).
   */
  scheduleWindow: ScheduleWindow | null;
  scheduleError: string | null;
  onNeedSchedule: () => void;
  /** Pitcher id → name and throwing hand, off the season roster the client
   *  holds from boot — what lets a fixture row name the man the other club is
   *  throwing. Free: it is a `Map` over a list already in hand. */
  pitcherLookup: PitcherLookup;
}) {
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

  /**
   * Which side he bats from, or which arm he throws with — the same token the
   * two roster tables print under a name, off the same map and the same rule.
   *
   * **The page says it at the tables' width, which is the one place this parts
   * from the chip above it.** That one is here in full because the board's cell
   * may truncate a six-position list and this never does — the two read one
   * fact at two widths. A hand is not a list: `LHB` is the whole of it, so
   * there is no longer form for the page's extra room to buy, and printing
   * `Bats left-handed` here would give the reader a second wording to learn for
   * a fact they already recognize from every row they arrived through. The
   * sentence is the tooltip, where it costs the heading nothing.
   *
   * Drawn twice for the reason `posChip` is: the game log's own head puts the
   * identity back when that table takes the page and covers this one, and a
   * head that dropped the hand would be the same man reading two ways
   * depending on which was on screen.
   */
  const hand = handCell(kind, useHandedness(playerId));
  const handChip = hand ? (
    <span className="player-hand" title={hand.title}>
      {hand.text}
    </span>
  ) : null;

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
  /**
   * The percentile card, **lazy on first open of its own tab** like every other
   * tab on this page — and it was the one exception, fetched eagerly on mount
   * whatever the reader was looking at.
   *
   * It is also the most expensive read the page makes: a Savant player-page
   * scrape, measured at **1.07s cold** against 0.16s for the splits and 0.05s
   * for the day and the game log. So opening anybody fired five requests at
   * once, the dearest of them for a card that is not the tab the page opens on
   * — and behind one Lambda those five do not overlap so much as queue.
   *
   * `splits` beside it stays eager and that is not an inconsistency: the
   * Overview's own season strip reads it, so it *is* the visible tab's data.
   */
  const [data, setData] = useState<PlayerPercentiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Keyed by kind as well as player, the way the day and the game log are: the
  // card is a batting one or a pitching one.
  const pctReq = useRef<string | null>(null);
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
  /** Which read is the newest. A cut is a control that gets pressed again
   *  before its answer is back, and only the newest may write these rows. */
  const windowsSeq = useRef(0);
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
  /**
   * His rotation — the **Projected Starts** block, which the Overview and the
   * Schedule tab now draw as one component, so the read is held here rather
   * than inside it. That is the shape the news and the game log already have
   * and it buys the same two things: the two tabs cannot show different turns,
   * and re-entering either costs no request. Keyed by **player alone**, the way
   * news is: a rotation slot is a fact about a person, and only one of his two
   * kinds could ever have one.
   */
  const [starts, setStarts] = useState<ProjectedStarts | null>(null);
  const [startsLoading, setStartsLoading] = useState(false);
  const [startsFailed, setStartsFailed] = useState(false);
  const startsReq = useRef<number | null>(null);
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
    | { kind: 'batter'; games: BatterGameLog[]; gaps: GameLogGap[] }
    | { kind: 'pitcher'; games: PitcherGameLog[] }
    | null
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

  useEffect(() => {
    const req = `${kind}-${playerId}`;
    if (tab !== 'percentiles' || pctReq.current === req) return;
    pctReq.current = req;
    setLoading(true);
    setError(null);
    // Whether the answer lands is decided by the ref, not by a `live` flag the
    // effect cleanup clears — and that is the whole of the fix for a tab that
    // hung. Switching away mid-read runs the cleanup, so a `live` gate threw the
    // answer away while the mark stood; coming back found the mark, returned
    // early, and left `loading` true with no second request coming — the wait up
    // for ever. Reproduced by leaving the tab while this read was in flight; the
    // scrape behind it is the slowest on the page, which is why it is the tab the
    // hang was reported against.
    //
    // The ref is the honest test of "is this still the read on screen": it is
    // nulled and re-marked only when the player or the kind changes, which is
    // exactly when a landing answer is stale. `.then(ok, err)` rather than
    // `.catch().finally()` so the error path can null the ref *after* clearing
    // the wait, a `finally` reading a ref its own `catch` had just nulled being
    // the way this fix goes wrong.
    api.percentiles(playerId, kind).then(
      (d) => {
        if (pctReq.current !== req) return;
        setData(d);
        setLoading(false);
      },
      (e: unknown) => {
        if (pctReq.current !== req) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setLoading(false);
        pctReq.current = null; // allow a retry on re-open
      },
    );
  }, [tab, playerId, kind]);

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
  //
  // **And the kind is part of "a new page", which the Batting/Pitching switch
  // made true.** It watched `playerId` alone, and every route into this page
  // changed both together until that switch existed — crossing it changes only
  // the kind, and none of the eleven things below would have been cleared. What
  // that leaves on screen is the *other half* of the man: `arsenal` and
  // `starts` and `news` are keyed on `playerId` alone and would not even
  // re-read, so Ohtani's pitch mix would sit under his batting page for as long
  // as it stayed open, and `day`, `windows` and `gameLog` would draw one kind's
  // answer while the next was in flight — which is not the "never over data"
  // rule but the opposite of it, an old answer to a question nobody asked.
  //
  // **Measured, by taking `kind` back out again**: open Ohtani's batting page,
  // press `Charts`, wait for the rolling xwOBA to draw, and cross to
  // `Pitching`. With `[playerId]` alone the page stays on `Charts` and goes on
  // drawing the **batting** series — read back seven seconds later, unchanged,
  // with no request made, `xwobaReq` being keyed on the id alone. With
  // `[playerId, kind]` the same press lands on `Overview` with the pitching
  // day under it and the `Arsenal` tab in the strip.
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
    pctReq.current = null;
    setData(null);
    setError(null);
    windowsReq.current = null;
    setWindows(null);
    setWindowsError(null);
    newsReq.current = null;
    setNews(null);
    setNewsError(null);
    startsReq.current = null;
    setStarts(null);
    setStartsFailed(false);
  }, [playerId, kind]);

  // The Overview tab's day, lazily on first open (which for this tab is the
  // page opening). No date is sent: the server's own baseball day is the one
  // definition of "today" the app should have, and a tab left open past the 3am
  // rollover would otherwise keep asking for yesterday.
  useEffect(() => {
    const req = `${kind}-${playerId}`;
    // **Two tabs want it and it is one read.** The Schedule tab turns on two
    // facts the day report carries and nothing else on this page does — his
    // club, and whether `isRotationStarter` places him in a rotation — so it
    // asks for the same report under the same key rather than fetching a second
    // copy free to disagree. In practice the Overview has already had it (this
    // is the tab the page opens on); what the second test buys is the case that
    // matters, a **failed** day read, where the error path nulls the ref and
    // pressing Schedule is then a retry.
    if ((tab !== 'overview' && tab !== 'schedule') || dayReq.current === req) return;
    dayReq.current = req;
    setDayLoading(true);
    setDayError(null);
    // The ref decides whether the answer lands, never a cleanup flag — see the
    // percentile read above, where the hang that rule is written for is set out.
    api.playerDay(playerId, kind).then(
      (d) => {
        if (dayReq.current !== req) return;
        setDay(d.player);
        setDayLoading(false);
      },
      (e: unknown) => {
        if (dayReq.current !== req) return;
        setDayError(e instanceof Error ? e.message : 'Failed to load');
        setDayLoading(false);
        dayReq.current = null; // allow a retry on re-open
      },
    );
  }, [tab, playerId, kind]);

  /**
   * Whether he works out of the rotation — `lib.ts::isRotationStarter`, the
   * app's one definition of it, read off the day report. It decides which block
   * the Overview draws in its second slot — his Projected Starts, or the first
   * five of his club's fixtures. Read here as well as in the component so the
   * *read* below can be gated on it: a batter has no rotation to ask about.
   */
  const wantStarts = day !== null && isPitcher && isRotationStarter(day);
  /**
   * **"Nobody has asked yet" is a wait, not an answer**, and this is the one
   * thing the hoist above had to add. `startsLoading` is set in an effect, which
   * runs *after* the paint that first mounts the block — so for one frame the
   * block held no rotation, no failure and no read in flight, which is exactly
   * the state its own refusal branch draws `Couldn’t read his club’s schedule.`
   * for. Rolling it into the flag the block is given means the beat before the
   * request goes out is drawn as the beat before the request goes out: nothing
   * at all, `WAIT_DELAY` not having elapsed.
   */
  const startsPending = startsLoading || (starts === null && !startsFailed);
  /**
   * His rotation, lazily and once — on either of the two tabs that draw it.
   *
   * It was `ProjectedStartsBlock`'s own effect until that block was drawn on
   * two tabs, at which point mounting it fetched: a tab switch away and back
   * was a fresh read, and two of them in development, StrictMode
   * double-invoking an effect guarded only by a `live` flag its cleanup
   * cleared. Measured before the move, pressing Schedule three times fired
   * **6** requests.
   *
   * **The Schedule tab no longer draws that block** — it draws his club's
   * fixtures with his turns marked off the shared window's own rotation, which
   * is the grid's reading and keeps a row here and a cell there from placing a
   * turn on two different days. So the gate is the Overview alone again. That
   * is not a narrowing in practice, the Overview being the tab this page opens
   * on, and it is one in principle: the rotation is read for the block that
   * draws it.
   *
   * The ref is the test and there is no cleanup flag, which is this page's
   * standing rule and the hang it is written for — see the percentile read
   * above. The error path nulls the ref, so re-opening the tab retries.
   */
  useEffect(() => {
    if (!wantStarts || tab !== 'overview') return;
    if (startsReq.current === playerId) return;
    startsReq.current = playerId;
    setStartsLoading(true);
    setStartsFailed(false);
    api.projectedStarts(playerId).then(
      (d) => {
        if (startsReq.current !== playerId) return;
        setStarts(d);
        setStartsLoading(false);
      },
      () => {
        if (startsReq.current !== playerId) return;
        // A failed read costs this block and nothing else — every other block
        // on the Overview is already drawn, and the Schedule tab says so.
        setStartsFailed(true);
        setStartsLoading(false);
        startsReq.current = null; // allow a retry on re-open
      },
    );
  }, [wantStarts, tab, playerId]);

  // The Stats tab's five window rows, lazily on first open — and **again each
  // time the reader picks a cut**, the cut being part of what was asked for.
  //
  // Two guards, and they answer different questions. The **ref** is the one
  // every lazy read on this page carries: it is what stops the request being
  // sent twice, and it is set to what was asked for rather than to a bare "yes"
  // so that a *different* question re-asks. The **sequence number** is what
  // decides whose answer may land — a cut is a control a reader presses twice
  // in three seconds, and a slow `vs LHP` returning after a fast `Home` would
  // otherwise write the wrong five rows under a lit pill. Neither is a cleanup
  // flag: an effect teardown must never unmark a read in flight, which is the
  // hang the percentile read above records.
  useEffect(() => {
    const req = `${kind}-${playerId}-${statsCut ?? 'all'}`;
    if (tab !== 'stats' || windowsReq.current === req) return;
    windowsReq.current = req;
    const seq = ++windowsSeq.current;
    setWindowsLoading(true);
    setWindowsError(null);
    api.playerWindows(playerId, kind, statsCut).then(
      (d) => {
        if (windowsSeq.current !== seq) return;
        setWindows(d);
        setWindowsLoading(false);
      },
      (e: unknown) => {
        if (windowsSeq.current !== seq) return;
        setWindowsError(e instanceof Error ? e.message : 'Failed to load');
        setWindowsLoading(false);
        windowsReq.current = null; // allow a retry on re-open
      },
    );
  }, [tab, playerId, kind, statsCut]);

  // Same lazy load for the Game Log tab — and for the **Overview**, which draws
  // the last five of its rows. One read serves both, which is the point of
  // hanging it here rather than inside the preview: crossing from the summary to
  // the full log is then free, and the two can never show different rows.
  useEffect(() => {
    const req = `${kind}-${playerId}`;
    if ((tab !== 'gamelog' && tab !== 'overview') || gameLogReq.current === req) return;
    gameLogReq.current = req;
    setGameLogLoading(true);
    setGameLogError(null);
    // The ref decides whether the answer lands, never a cleanup flag — see the
    // percentile read above, where the hang that rule is written for is set out.
    (isPitcher ? api.pitcherGameLog(playerId) : api.gameLog(playerId)).then(
      (d) => {
        if (gameLogReq.current !== req) return;
        setGameLog(d);
        setGameLogLoading(false);
      },
      (e: unknown) => {
        if (gameLogReq.current !== req) return;
        setGameLogError(e instanceof Error ? e.message : 'Failed to load');
        setGameLogLoading(false);
        gameLogReq.current = null; // allow a retry on re-open
      },
    );
  }, [tab, playerId, isPitcher, kind]);

  // The News tab's items, and the Overview's preview of them. One read for
  // both, the rule the game log above it follows and for the same reason: the
  // preview is the top of this very list, so two reads could show two lists.
  useEffect(() => {
    if ((tab !== 'news' && tab !== 'overview') || newsReq.current === playerId) return;
    newsReq.current = playerId;
    setNewsLoading(true);
    setNewsError(null);
    // The ref decides whether the answer lands, never a cleanup flag — see the
    // percentile read above, where the hang that rule is written for is set out.
    api.playerNews(playerId).then(
      (d) => {
        if (newsReq.current !== playerId) return;
        setNews(d);
        setNewsLoading(false);
      },
      (e: unknown) => {
        if (newsReq.current !== playerId) return;
        setNewsError(e instanceof Error ? e.message : 'Failed to load');
        setNewsLoading(false);
        newsReq.current = null; // allow a retry on re-open
      },
    );
    // `playerId` as well as the tab, the way the four reads above it are keyed:
    // the reset effect nulls the ref when the player changes, and on deps of
    // `[tab]` alone nothing would then re-run it — a page opened on a new player
    // from the Overview would keep an empty News tab until some tab was pressed.
  }, [tab, playerId]);

  // Same lazy load for the Arsenal tab.
  useEffect(() => {
    if (tab !== 'arsenal' || arsenalReq.current === playerId) return;
    arsenalReq.current = playerId;
    setArsenalLoading(true);
    setArsenalError(null);
    // The ref decides whether the answer lands, never a cleanup flag — see the
    // percentile read above, where the hang that rule is written for is set out.
    api.arsenal(playerId).then(
      (d) => {
        if (arsenalReq.current !== playerId) return;
        setArsenal(d);
        setArsenalLoading(false);
      },
      (e: unknown) => {
        if (arsenalReq.current !== playerId) return;
        setArsenalError(e instanceof Error ? e.message : 'Failed to load');
        setArsenalLoading(false);
        arsenalReq.current = null; // allow a retry on re-open
      },
    );
  }, [tab, playerId]); // as above: the ref is nulled on a player change, so the deps must see one

  // Fetch the season xwOBA series the first time the Charts tab is opened for
  // this player (xwobaReq tracks which player we've already requested).
  useEffect(() => {
    if (tab !== 'charts' || xwobaReq.current === playerId) return;
    xwobaReq.current = playerId;
    setXwobaLoading(true);
    setXwobaError(null);
    // The ref decides whether the answer lands, never a cleanup flag — see the
    // percentile read above, where the hang that rule is written for is set out.
    api.xwoba(playerId, kind).then(
      (d) => {
        if (xwobaReq.current !== playerId) return;
        setXwoba(d);
        setXwobaLoading(false);
      },
      (e: unknown) => {
        if (xwobaReq.current !== playerId) return;
        setXwobaError(e instanceof Error ? e.message : 'Failed to load');
        setXwobaLoading(false);
        xwobaReq.current = null; // allow a retry on re-open
      },
    );
  }, [tab, playerId, kind]);

  return (
    // The Game Log makes the overlay a fixed-height column so only its table
    // scrolls — see `.details-view.gamelog-mode`, which is the only way its
    // header row can stick over a season's worth of rows.
    //
    // Everything this box *is* — the fixed page, its layer, the pinned chrome,
    // the tab strip, the scroll reset and the Escape — is `DetailsShell`, which
    // the team page is drawn on too. See there; what is left here is the head,
    // the strip and the nine readings.
    <DetailsShell
      tab={tab}
      /* A different player is a different page. Keyed by kind as well as by
         id: a two-way player is two pages under one number. */
      resetKey={`${kind}-${playerId}`}
      onClose={onClose}
      className={tab === 'gamelog' ? 'gamelog-mode' : undefined}
      tabsLabel="Player sections"
      head={
        <>
          <div className="details-id">
            {/* The portrait and the club under it are one column: his picture
                and whose cap is on it. The pair is taller than the name block
                beside it, which is what lifts the portrait to the top of the
                head — it sat centered against three lines of text before. */}
            <div className="details-id-photo">
              <DetailsPhoto playerId={playerId} name={name} kind={kind} />
              <TeamDoor report={day} onOpenTeam={onOpenTeam} />
            </div>
            <div>
              <h1 className="details-name">
                {name}
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
              {/* **Where he plays and which way he does it, on their own line
                  under the name** — the shape the roster's own identity block
                  already uses (`PlayerIdentity`'s `.row-id-sub`, club → position
                  → hand), so the page and the row a reader arrived through say
                  one fact in one order. The two were inside the `<h1>` until
                  this: correct as a run of facts *about him*, but they were
                  reading as part of his name at a glance, and the heading had to
                  hold them alongside the padlock and the newspaper — marks that
                  are pressable where these two are not. Split, the `<h1>` is the
                  name and the things you can press on it, and this line is the
                  standing description of the man, directly above the Rostered
                  line that is the same kind of thing.

                  **The tokens themselves are unchanged** — the same `posChip`
                  and `handChip` built once above and drawn again in the game
                  log's head, in the same vocabulary and the same order. Only
                  their line moved; nothing about what they say did.

                  **The line is always drawn, and reserves its own box.** This
                  head is pinned chrome over a scroller, so a line that appeared
                  when the handedness map landed — it is null until the boot
                  request does — would push the whole page down under the
                  reader's finger. With neither token to draw, a hidden chip
                  holds the height instead: the box is *laid out* rather than
                  declared, so it is exactly as tall as a real chip in whatever
                  font the platform gives us. */}
              <p className="details-sub">
                {/* ESPN's eligibility where there is a league to read it from,
                    MLB's listed position otherwise — see `posChip`. */}
                {posChip}
                {/* And which way he does it, immediately after where he does
                    it — the two are one kind of fact and the line reads outward
                    from the name through them. Text rather than a second
                    bordered chip, and in the same `--faint` the tables give it:
                    a grounded pill beside a grounded pill would put `LHB` in
                    exactly the shape this page uses for a *position* and invite
                    a reader to take it for one. */}
                {handChip}
                {!posChip && !handChip && (
                  <span className="player-pos details-sub-ghost" aria-hidden="true">
                    &mdash;
                  </span>
                )}
              </p>
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
                  {/* The spans `App` hands down — the board's three shortest,
                      in the same order and the same vocabulary, so the page and
                      the table never disagree about a span they both draw.
                      Each states its own span rather than the sentence a single
                      trend used to read ("▲ 1.2 in 7d"): a run of those is a
                      paragraph, where the span up front and the move behind it
                      is a row that can be scanned across. A flat window keeps
                      its 0.0 in the muted color — the server drops zeroes from
                      the wire and the client fills them back, so flat is a real
                      answer here and not an absence. */}
                  {rosterPct !== null && rosterTrends && rosterTrends.length > 0 && (
                    <span className="details-trends">
                      {rosterTrends.map((t) => (
                        <span
                          key={t.window}
                          className={`details-trend${
                            t.change === null
                              ? ''
                              : t.change > 0
                                ? ' up'
                                : t.change < 0
                                  ? ' down'
                                  : ''
                          }`}
                          title={
                            t.change === null
                              ? `No reading over the last ${t.days} day${t.days === 1 ? '' : 's'} — two ESPN players share this name, so the figure stored that far back is the other one's`
                              : `Change over the last ${t.days} day${t.days === 1 ? '' : 's'}`
                          }
                        >
                          <span className="details-trend-span">{t.days}d</span>
                          {/* A dash, not a zero: this window has no reading for
                              him at all, and `0.0` is a claim that he has not
                              moved. Same vocabulary the board's own trend
                              columns use for the same absence. */}
                          {t.change === null
                            ? '—'
                            : t.change === 0
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
        </>
      }
      chromeExtra={
        <>

          {/**
            * **Which half of a two-way player is being read** — a tier above the
            * tabs, and drawn only for the men who have two.
            *
            * It sits **between the head and the tab strip** because that is what
            * it is: the head says *who*, this says *which of him*, and the strip
            * under it says *which reading of that*. Put on the identity line
            * beside the position chip it would have read as a fact about him
            * rather than a control, and put in the cluster on the right it would
            * have joined the two things you *do to* him — where this is
            * navigation, like the Back button at the other end of the head.
            *
            * It is `.view-switch`/`.view-tab` rather than a shape of its own,
            * which is the app's rule for a segmented control: the League page's
            * three tabs and the Schedule spans are the same two classes, so a
            * reader who knows one knows this. Only the row around it is new, and
            * all it does is put the switch in the head's own 680px column.
            *
            * **It changes the URL, and it has to.** The page is opened on
            * `player=${kind}-${id}` and the two halves are two keys, so a switch
            * that left the parameter alone would leave a link describing the page
            * the reader started on rather than the one in front of them — the
            * rule every other view in this app follows. So it goes through the
            * same `onOpenDetails` the Overview's scheduled game uses to open the
            * opposing starter: one door into a player page, however it is
            * reached, and the Back button behaves afterwards exactly as it does
            * on any other page opened over this one.
            */}
          {twoWay && (
            <div className="details-kind-row">
              {/* `role="tablist"` with `aria-selected`, which is what every other
                  `.view-switch` in the app declares — the matchup's two sides, the
                  opponent table's spans and venues, the Schedule control's runs —
                  and three of those change a URL parameter exactly as this does.
                  A `group` of `aria-pressed` toggles was the alternative and would
                  have made this the one segmented control announcing itself
                  differently from the rest. */}
              <div className="view-switch" role="tablist" aria-label="Which half of this player">
                {(['batter', 'pitcher'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    className={`view-tab${kind === k ? ' active' : ''}`}
                    aria-selected={kind === k}
                    onClick={() => {
                      if (kind !== k) onOpenDetails(`${k}-${playerId}`);
                    }}
                    title={
                      k === 'batter'
                        ? `${name} at the plate — his batting page`
                        : `${name} on the mound — his pitching page`
                    }
                  >
                    {k === 'batter' ? 'Batting' : 'Pitching'}
                  </button>
                ))}
              </div>
            </div>
          )}

        </>
      }
      tabs={
        <>
          {/* First and default: what he is doing today, which is the question
              this page is opened with on a game day. The rest are readings of
              his season, and they run pictures-before-numbers — the arsenal
              (pitchers), the percentile card and the splits, then the news, the
              stats and the games. */}
          <DetailsTabButton id="overview" tab={tab} onPick={setTab}>
            Overview
          </DetailsTabButton>
          {/* **Arsenal is second on a pitcher, directly after the Overview**,
              where it was third and, before that, trailed the Game Log. Each
              move is the same argument one step further: the charts are a
              picture of *what kind of pitcher this is* — what he throws and
              where it moves — where Stats and the Game Log are the numbers he
              has put up, and a reader deciding about a stranger takes the
              pictures first. What the last step adds is that of the two
              pictures, the arsenal is the one that is *only* his: a percentile
              card is his season placed against everybody's, which is a reading
              a pitcher shares with every batter on the strip, where nobody
              else's arsenal is on this page at all. It also puts the one
              pitcher-only tab where a phone can reach it without scrolling the
              strip — measured at 390px, it is fully in view at `scrollLeft 0`.
              Numbered nowhere: the strip's order is the order these buttons are
              written in (see `DetailsTab`), so this is the whole of the
              change. */}
          {isPitcher && (
            <DetailsTabButton id="arsenal" tab={tab} onPick={setTab}>
              Arsenal
            </DetailsTabButton>
          )}
          <DetailsTabButton id="percentiles" tab={tab} onPick={setTab}>
            Percentile Rankings
          </DetailsTabButton>
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
          <DetailsTabButton id="splits" tab={tab} onPick={setTab}>
            Splits
          </DetailsTabButton>
          {/* **News reads before Stats and the Game Log**, which is the same
              order the Overview's blocks are in and for the same reason: the
              news is what has happened to him *this week* — an IL placement, a
              call-up, a report he is losing a job — where Stats and the Game
              Log are the record of what he has done. A reader deciding about a
              stranger wants to know he is hurt before reading his 30-day
              xwOBA. */}
          <DetailsTabButton id="news" tab={tab} onPick={setTab}>
            News
          </DetailsTabButton>
          <DetailsTabButton id="stats" tab={tab} onPick={setTab}>
            Stats
          </DetailsTabButton>
          <DetailsTabButton id="gamelog" tab={tab} onPick={setTab}>
            Game Log
          </DetailsTabButton>
          {/* **Schedule reads after the Game Log, where it used to be second.**
              It went in directly after Overview on the argument that *now →
              next → the record* is one direction of travel, and what that
              argument left out is which of the two questions this page is
              opened with. The Overview now carries the forward half itself — a
              rotation starter's next five turns, and everybody else's next five
              games with a `Schedule →` door on the heading — so the two halves
              of "what is he doing" are on **one tab** rather than two adjacent
              ones, which is the thing the old ordering was protecting. What is
              left for the tab is the fortnight behind that preview, which is a
              deeper reading rather than a first one, and it belongs where the
              other deep readings are: past the pictures and the numbers, at the
              end where a reader goes on purpose. It is also the one tab a
              *door* leads to, so its place in the strip stopped being how it is
              reached. */}
          <DetailsTabButton id="schedule" tab={tab} onPick={setTab}>
            Schedule
          </DetailsTabButton>
          {/* **`Charts`, where this read `Rolling xwOBA`.** The strip names the
              *kind* of reading a tab holds — Overview, Splits, Stats, Game Log —
              and this was the one entry naming a single card instead, which is
              also the longest label on a strip a phone already scrolls. The card
              inside it still says `Rolling xwOBA · 2026`, so nothing is lost:
              the tab says which kind of reading, the card says which reading. */}
          <DetailsTabButton id="charts" tab={tab} onPick={setTab}>
            Charts
          </DetailsTabButton>
        </>
      }
    >

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
             to disagree with the tab it summarizes. */
          season={splits?.season ?? null}
          pitcherSeason={pitcherSplits?.season ?? null}
          seasonLoading={splitsLoading}
          gameLog={gameLog}
          gameLogLoading={gameLogLoading}
          news={news}
          newsLoading={newsLoading}
          starts={starts}
          startsLoading={startsPending}
          startsFailed={startsFailed}
          /* The same window the Schedule tab draws, handed to the block that
             previews it — one object for every player, read once for the
             session, so the second surface to ask costs nothing. */
          scheduleWindow={scheduleWindow}
          scheduleError={scheduleError}
          onNeedSchedule={onNeedSchedule}
          pitcherLookup={pitcherLookup}
          onTab={setTab}
          onOpenDetails={onOpenDetails}
        />
      )}

      {/* The Schedule tab draws its own waits and its own empty states — every
          player's rows are his club's fixtures off the shared window, with a
          starter's own turns marked within them — so there is nothing to gate
          here the way the tabs below are gated. The day it reads is the same
          `day` the Overview draws, which is why it is handed down rather than
          fetched again. */}
      {tab === 'schedule' && (
        <PlayerScheduleTab
          report={day}
          reportLoading={dayLoading}
          playerId={playerId}
          name={name}
          isPitcher={isPitcher}
          scheduleWindow={scheduleWindow}
          scheduleError={scheduleError}
          onNeedSchedule={onNeedSchedule}
          pitcherLookup={pitcherLookup}
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
              {handChip}
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
      {/* **A block wait only where there is nothing to show yet.** The first
          open of this tab has no rows, so it gets the ball; a *cut* is a re-read
          of a table already on screen, and the app's rule is that a pane with
          rows in it is read quietly — the last answer stands while the next is
          in flight, and the only mark is the `Updating` badge inside the control
          that started it. Gated on `windows` rather than on the delayed flag, so
          neither state can blank the other. */}
      {tab === 'stats' && windowsWait && !windows && (
        <LoadingBlock>Reading the stat lines</LoadingBlock>
      )}
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
      {tab === 'stats' && windows && (
        <PlayerWindowTable
          kind={kind}
          windows={windows.windows}
          columnKeys={statsColumns}
          onColumnsChange={onStatsColumnsChange}
          showRanks={showRanks}
          onShowRanksChange={onShowRanksChange}
          populations={rankPopulations}
          onNeedPopulations={onNeedRankPopulations}
          /* Which cut is *asked for*, not which the rows on screen are: the
             pressed pill lights at once and the badge beside it says the table
             is catching up, which is the app's own answer to a control whose
             answer takes a round trip. */
          cut={statsCut}
          onCutChange={onStatsCutChange}
          updating={windowsLoading}
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
      {/* **The read failed, which is a fact about the read and about nothing
          else.** A percentile card is a population, and there is more than one
          way for one to come back with nothing in it; the two that are actually
          reachable are told apart on the *server* rather than by reading the
          upstream's own sentence here — see `percentiles.ts::scrape`, which
          answers a player Savant holds no card for with an empty card and
          reserves a thrown error for a page it could not read at all.

          So this branch is only ever the second of those, and it says so: the
          reason is quoted because it is the useful half, and the sentence round
          it is there because the alternative — the raw
          `No Statcast percentile data for 807739 in 2026` this used to print
          under `Couldn’t load percentile rankings` — read as a verdict on a
          player rather than as our own read falling over. The way to try again
          is the tab, which drops its mark on failure so re-entering re-reads
          (`pctReq.current = null` in the effect above), and an empty state
          names the control that answers it. */}
      {tab === 'percentiles' && error && !loading && (
        <div className="details-status details-error">
          Couldn’t read the percentile card: {error}. That is this read failing rather than
          anything about {name} — leave the tab and come back to try it again.
        </div>
      )}
      {tab === 'percentiles' && data && !loading && data.sections.length > 0 && (
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
        </div>
      )}
      {/* **A card that came back empty, which is the new case and a real
          answer.** Savant has no major-league Statcast season for him of this
          kind — measured on a prospect a fantasy league has rostered (Kade
          Anderson, whose pitching page carries no `statcast:` payload at all)
          and on a batter asked for a pitcher's card.

          It says the same thing the Overview tab says two tabs over, in the
          same words, because it is the same fact: *has not appeared in a
          major-league game this season*. The pitcher's wording narrows it to
          the half this card is about — a man who has only ever batted has
          appeared, and only "has not pitched" is true of him — and the second
          clause is what makes it an empty state rather than a note: the card
          *is* a rank against the players who did.

          It is not drawn inside `.pct-card`, where it used to sit under a
          heading reading `2026 MLB Percentile Rankings` — a title over a card
          with no rankings in it. */}
      {tab === 'percentiles' && data && !loading && data.sections.length === 0 && (
        <div className="details-status">
          {isPitcher
            ? `${name} has not pitched in a major-league game this season, so there is nothing to rank him against.`
            : `${name} has not appeared in a major-league game this season, so there is nothing to rank him against.`}
        </div>
      )}
    </DetailsShell>
  );
}
