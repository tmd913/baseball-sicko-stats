import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { api } from '../api';
import { useResource, useResourcePoll } from '../resource';
import type {
  PlayerCut,
  PercentileMetric,
  PlayerKind,
  PlayerPagePayload,
  PlayerReport,
  ResearchRow,
  ScheduleWindow,
  SeasonArsenal,
  SplitCut,
} from '../types';
import { PLAYER_CUTS } from '../types';
import {
  CUT_LABEL,
  cutOf,
  handCell,
  headshotUrl,
  isRotationStarter,
  LIVE_POLL_MS,
  savantPlayerUrl,
  SEASON_STALE_MS,
  statusCorner,
} from '../lib';
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
import { LoadingBlock, PaneBusy, SpinningBaseball } from './Loading';
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

/**
 * **How much of the percentile card is drawn**, and the vocabulary lives here
 * rather than on the record for the reason `theme.ts` owns the theme's: the
 * server stores the word and validates only that it is one, so a density a
 * newer build introduces is ignored by an older tab instead of rejected by an
 * older server.
 *
 * `summary` is **Savant's own card** — the fifteen bars anyone who says "the
 * Savant card" means, in its groups and its order, transcribed from the player
 * page's own bundle rather than remembered (see `percentiles.ts`). `detailed`
 * is this app's reading: every row Savant ranks, grouped for someone working
 * through a stranger's profile.
 *
 * Both arrive in **one response** off one scrape, so the switch is a render and
 * never a request — which is the whole reason it can be a switch rather than a
 * tab. Flipping it cannot show two cards that disagree about a number, because
 * there is only ever one set of numbers.
 */
export const PERCENTILE_DENSITIES = ['summary', 'detailed'] as const;
export type PercentileDensity = (typeof PERCENTILE_DENSITIES)[number];

/**
 * **Savant's card, not ours.** A reader who opens this tab has come for the
 * card they know from the player page, and the thirty-nine-row version is a
 * door off it rather than the front of it. Absence-is-the-default on the record
 * is exactly what lets that call be revisited without anybody's saved
 * preference needing to be.
 */
export const DEFAULT_DENSITY: PercentileDensity = 'summary';

/** A stored density, or the default for anything this build does not know —
 *  including `undefined`, which is what an untouched record reads as. */
export function toDensity(v: string | undefined): PercentileDensity {
  return PERCENTILE_DENSITIES.find((d) => d === v) ?? DEFAULT_DENSITY;
}

/**
 * **The cuts, in the groups they fall into.**
 *
 * One run of six pills wrapped and stranded the last of them, and worse, said
 * nothing about what the six *are*: `Season` and `Last 100 AB` are two spans,
 * the two hands are one question and the two parks another. Three groups is
 * how a reader looking for the platoon split finds it without reading all six.
 *
 * They remain **one selection** — only ever one pill is lit across the three —
 * which is what keeps them alternatives rather than three independent
 * settings. Grouped `.split-switch`es are the board's own language for this:
 * its bar sets the span and the position in two boxes read as one sentence.
 */
const CUT_GROUPS: { key: string; cuts: (PlayerCut | null)[] }[] = [
  { key: 'span', cuts: [null, 'last100'] },
  { key: 'hand', cuts: ['vsr', 'vsl'] },
  { key: 'park', cuts: ['home', 'away'] },
];

/** The unit `cutSample` is counted in, for the sentence under a cut card. */
const sampleUnit = (isPitcher: boolean, n: number): string =>
  isPitcher ? (n === 1 ? 'batter faced' : 'batters faced') : n === 1 ? 'plate appearance' : 'plate appearances';

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
  pctCut,
  onPctCutChange,
  pctDensity,
  onPctDensityChange,
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
  /** **Which cut the Percentile Rankings card is drawn over**, or null for his
   *  whole season — `pcut=` in the URL, under its own key rather than sharing
   *  the Stats tab's `cut=`, since a reader can want the left-handed card and
   *  the uncut table. Held by App for the reason `statsCut` is: this component
   *  is unmounted the moment the overlay closes and a URL param has to outlive
   *  it. Its vocabulary is one wider — `PLAYER_CUTS` adds recent form. */
  pctCut: PlayerCut | null;
  onPctCutChange: (cut: PlayerCut | null) => void;
  /** **How many bars that card draws** — Savant's fifteen or all thirty-odd.
   *  A saved preference rather than a URL param, the line `showRanks` is on: it
   *  is a habit of reading rather than which numbers are on screen. Both
   *  arrangements ride in one response, so this is a render and never a
   *  request. */
  pctDensity: PercentileDensity;
  onPctDensityChange: (density: PercentileDensity) => void;
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
  /**
   * **This page's nine reads, as nine keys on the resource store** — see
   * `resource.ts`. What stood here was nine `useState` triples, eight
   * `*Req.current` marks, two sequence numbers and an eleven-line reset effect
   * to clear all of it when the player changed.
   *
   * **The mark and the reset are what the key replaces**, and they were the
   * page's two standing hazards:
   *
   * - a mark set *before* the answer landed is what hung the percentile tab for
   *   the life of the page — leaving the tab mid-read ran the cleanup, the
   *   answer was thrown away with the mark still standing, and coming back
   *   found the mark and returned early with `loading` true and no second
   *   request coming. The fix was to make the ref the test rather than a `live`
   *   flag; here there is no mark at all. A read is decided by the entry's own
   *   state, an answer lands in the entry whether or not anybody is still
   *   watching, and coming back to the tab finds it there.
   * - the reset effect had to name **eleven** things, and the record of it
   *   getting that wrong is in the comment that survives below: it watched
   *   `playerId` alone until the Batting/Pitching switch existed, so crossing
   *   the switch left the other half of a two-way player on screen. Nothing
   *   needs naming now — the kind and the player are *in* each key, so the
   *   other half of Ohtani is a different question with a different answer.
   *
   * **A null key is "this tab is not open"**, which is the whole of the lazy
   * rule this page keeps. `percentiles` is the read it matters most for: a
   * Savant player-page scrape measured at **1.07s** cold against 0.16s for the
   * splits and 0.05s for the day, so it stays off the burst that opening
   * anybody fires. `splits` is deliberately keyless-gated — eager — because the
   * Overview's own season strip reads it, so it *is* the visible tab's data.
   *
   * **`family` is what a cut change is and a player change is not.** The
   * percentile card and the Stats window table are keyed on the man *and* the
   * cut, and pressing `vs LHP` must leave the season card up until the new one
   * lands while opening a different man must not — see `resource.ts`.
   */
  const who = `${kind}-${playerId}`;

  /** His day. The Overview's, and the Schedule tab's — two tabs, one read, so
   *  they cannot show different games. The cheap half of what the page makes on
   *  open: one day of one player, every layer under it a cache the feed and the
   *  boards are already filling. No date is sent — the server's own baseball
   *  day is the one definition of "today" the app should have, and a tab left
   *  open past the 3am rollover would otherwise keep asking for yesterday. */
  /**
   * **Unconditional, because the head is.** This was gated to the two tabs that
   * draw a day block — and the *head* is drawn on all nine, with `TeamDoor`
   * reading its club off this very report. On the other seven the key was null,
   * so `day` was null, so the door fell back to its `aria-hidden` ghost and the
   * reader watched his club vanish on every tab but two. Driven before the fix:
   * `NYY →` present on Overview and Schedule, absent from Percentile Rankings,
   * Splits, News, Stats, Game Log and Charts.
   *
   * It costs a request only for a reader who opens straight onto one of those
   * seven, and the comment above already says why that is affordable: one day
   * of one player, every layer under it a cache something else is filling. For
   * the ordinary path — open on Overview, cross the strip — the key does not
   * change, so nothing is re-read and the club never blinks.
   */
  const dayKey = `playerDay:${who}`;
  /**
   * **The page's open burst, as one read** — his day, season line and platoon
   * halves, news, game log and next game.
   *
   * These were five requests firing in the same tick (measured, +283ms on
   * open), which on Lambda is five containers; on a low-traffic app most are
   * new, and a cold container costs 1,368ms at p50 against 239ms warm for the
   * same work because each holds its own empty copy of the server's caches.
   * One request is one container and one warm set of them.
   *
   * **The nine tabs stay lazy and that is the point.** The percentile card, the
   * Stats table, Charts and the arsenal are still keyed on their own tab and
   * still cost nothing to a reader who never presses them — batching those
   * would have thrown away the rule this page is built on. What is batched is
   * only what already fired together on open.
   *
   * `keepPrevious: false` for the reason the day always had it: an answer about
   * a different man is not a stale answer to the question on screen.
   */
  const pageRes = useResource<PlayerPagePayload>(
    dayKey,
    () => api.playerPage(playerId, kind),
    { keepPrevious: false, staleMs: SEASON_STALE_MS },
  );
  const page = pageRes.value ?? null;
  const day = page?.day ?? null;
  const dayError = pageRes.error?.message ?? null;
  const dayLoading = pageRes.loading;
  /**
   * **And it re-reads itself while he is batting**, on the roster's own twenty
   * seconds.
   *
   * This page had **no poll at all**, and the fault is `LeagueTeam`'s exactly:
   * the read fired once when the tab opened, behind a `dayReq.current === req`
   * mark that made a second one impossible, so a player page opened during a
   * live game drew that moment's line for as long as it stayed open — while the
   * roster row *behind the overlay* moved every twenty seconds off the same
   * `/api/report` the same server builds this from. Two surfaces drawing one
   * man on two clocks, one of which had stopped, which is the thing the app's
   * one-clock rule exists to prevent.
   *
   * **The roster's clock**, because this is the roster's fact: a `PlayerReport`
   * whose fastest-moving half is a plate appearance. **Gated on a real live
   * game** read off his own day, so a man whose game is final has nothing to
   * re-read and a page left open overnight does not ask every twenty seconds to
   * be told so. **Quiet** by rule 1 — the store counts a poll apart from a read
   * somebody started, so nothing on the page blanks or spins for it.
   *
   * Only the day. The game log, the news, the arsenal and the percentile card
   * are season-shaped and do not move with a pitch; the Overview's five-game
   * preview comes off the log and stays where it is until the game is final,
   * which is what the log itself says.
   */
  const dayLive = day?.games.some((g) => g.status.state === 'live') ?? false;
  useResourcePoll(dayKey, dayLive ? LIVE_POLL_MS : null);
  /**
   * Whether he works out of the rotation — `lib.ts::isRotationStarter`, the
   * app's one definition of it, read off the day report. It decides which block
   * the Overview draws in its second slot — his Projected Starts, or the first
   * five of his club's fixtures. Read here as well as in the component so the
   * *key* below can be gated on it: a batter has no rotation to ask about, and
   * a null key is how this page says so.
   */
  const wantStarts = day !== null && isPitcher && isRotationStarter(day);

  /** The percentile card — the most expensive read the page makes, and the one
   *  the lazy rule was written for. The cut is part of the question and so part
   *  of the key; the man is the family, so a cut change keeps the card up and a
   *  new man blanks it. */
  const pctRes = useResource(
    tab === 'percentiles' ? `percentiles:${who}:${pctCut ?? 'all'}` : null,
    () => api.percentiles(playerId, kind, pctCut),
    { family: who, staleMs: SEASON_STALE_MS },
  );
  const data = pctRes.value ?? null;
  const error = pctRes.error?.message ?? null;
  const loading = pctRes.loading;
  /**
   * **A cut change is `updating`, never `loading`** — and wiring the mark to
   * the wrong one is why pressing a cut looked like pressing nothing.
   *
   * `resource.ts` computes them as a pair: `loading` is `loud > 0 && value ===
   * undefined`, `updating` is `loud > 0 && value !== undefined`. The percentile
   * card is `family: who`, so a cut change **carries** the previous card — which
   * is deliberate and is rule 1 — and therefore `value` is defined and
   * `loading` is **false for the whole of the read the badge existed to
   * announce**. The `pct-updating` slot below was gated on `loading && data`, a
   * conjunction that cannot be true on this key, so it never once appeared.
   */
  const pctBusy = pctRes.updating;

  /* The season line and platoon splits are fetched here (not passed in) so the
     details view works for any player, whether or not they're on the watchlist.
     Two hooks with one live key between them rather than one hook over a union:
     a batter's splits and a pitcher's are different shapes, and the kind that
     is not on screen simply has no key. */
  /* Off the page read above. It was two hooks with one live key between them —
     a batter's splits and a pitcher's being different shapes — and the wire now
     carries one field discriminated on `kind`, which says the same thing in one
     read instead of two. The narrowing below is what keeps the two shapes
     apart on this side. */
  const splits = page?.splits?.kind === 'batter' ? page.splits : null;
  const pitcherSplits = page?.splits?.kind === 'pitcher' ? page.splits : null;
  const splitsError = pageRes.error?.message ?? null;
  const splitsLoading = pageRes.loading;

  /** The Stats tab's window table: this player's row on each of the research
   *  board's five windows. Five reads of blobs the warmer already keeps hot, so
   *  the cost is a round trip rather than an upstream — but a round trip nobody
   *  who never opens the tab should pay. Keyed and familied like the percentile
   *  card, and for the same two reasons. */
  const windowsRes = useResource(
    tab === 'stats' ? `playerWindows:${who}:${statsCut ?? 'all'}` : null,
    () => api.playerWindows(playerId, kind, statsCut),
    { family: who, staleMs: SEASON_STALE_MS },
  );
  const windows = windowsRes.value ?? null;
  const windowsError = windowsRes.error?.message ?? null;
  const windowsLoading = windowsRes.loading;
  /** The Stats table's cut change, on the same reasoning as `pctBusy` above and
   *  with the same fault behind it: `windowsRes` is familied on the man, so a
   *  split press carries the previous split's rows and `loading` stays false
   *  while they sit under the new split's heading. */
  const windowsBusy = windowsRes.updating;

  /** His news — the News tab's items and the Overview's preview of the top
   *  three. One read for both, which is what stops the preview and the tab ever
   *  showing different items. Keyed by **player alone**, where the day, the log
   *  and the window table are keyed by kind as well: news is a fact about a
   *  person, so a two-way player has one list rather than two. */
  /* Off the page read. It was gated on `news` or `overview`; both now have it
     the moment the page opens, and the News tab costs no request of its own —
     which is the guarantee the old comment wanted (one read, so the preview and
     the tab can never show different items) made stronger. */
  const news = page?.news ?? null;
  const newsError = pageRes.error?.message ?? null;
  const newsLoading = pageRes.loading;

  /** His rotation — the **Projected Starts** block. Read here rather than
   *  inside the component so the Overview and the Schedule tab cannot show
   *  different turns and re-entering either costs no request. Keyed by player
   *  alone, the way news is: a rotation slot is a fact about a person, and only
   *  one of his two kinds could ever have one.
   *
   *  A failed read costs this block and nothing else — every other block on the
   *  Overview is already drawn, and the Schedule tab says so. */
  const startsRes = useResource(
    wantStarts && tab === 'overview' ? `projectedStarts:${playerId}` : null,
    () => api.projectedStarts(playerId),
    { keepPrevious: false, staleMs: SEASON_STALE_MS },
  );
  const starts = startsRes.value ?? null;
  const startsLoading = startsRes.loading;
  const startsFailed = startsRes.error != null;
  /**
   * **"Nobody has asked yet" is a wait, not an answer.** `loading` goes up in
   * an effect, which runs *after* the paint that first mounts the block — so
   * for one frame the block holds no rotation, no failure and no read in
   * flight, which is exactly the state its own refusal branch draws
   * `Couldn't read his club's schedule.` for. Rolling it into the flag the
   * block is given means the beat before the request goes out is drawn as the
   * beat before the request goes out: nothing at all, `WAIT_DELAY` not having
   * elapsed.
   */
  const startsPending = startsLoading || (starts === null && !startsFailed);

  /** The season xwOBA series behind the Charts tab — a heavier Savant fetch.
   *  Keyed on the kind as well as the man, which the old `xwobaReq` was not:
   *  it held the id alone, so crossing the Batting/Pitching switch relied on
   *  the reset effect to clear it and on nothing else. */
  const xwobaRes = useResource(
    tab === 'charts' ? `xwoba:${who}` : null,
    () => api.xwoba(playerId, kind),
    { keepPrevious: false, staleMs: SEASON_STALE_MS },
  );
  const xwoba = xwobaRes.value ?? null;
  const xwobaError = xwobaRes.error?.message ?? null;
  const xwobaLoading = xwobaRes.loading;

  /** The season game log — the Game Log tab's rows, and the last five of them
   *  as the Overview's preview. One read serves both, so crossing from the
   *  summary to the full log is free and the two can never show different
   *  rows. */
  /* Off the page read, on the same reasoning as the news above: one answer
     serves the Overview's five-game preview and the Game Log tab, so crossing
     between them is free and the two cannot show different rows. */
  const gameLog = page?.gameLog ?? null;
  const gameLogError = pageRes.error?.message ?? null;
  const gameLogLoading = pageRes.loading;

  /** The season arsenal behind the pitcher-only Arsenal tab — another heavy
   *  Savant fetch, lazy in the same way. */
  const arsenalRes = useResource(
    tab === 'arsenal' ? `arsenal:${playerId}` : null,
    () => api.arsenal(playerId),
    { keepPrevious: false, staleMs: SEASON_STALE_MS },
  );
  const arsenal = arsenalRes.value ?? null;
  const arsenalError = arsenalRes.error?.message ?? null;
  const arsenalLoading = arsenalRes.loading;

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

  /**
   * **The card at the density this reader asked for**, and the other one beside
   * it — both already in hand, since one scrape builds both (see
   * `percentiles.ts::scrape`). That is what makes the switch a render: there is
   * nothing to fetch because there was never a second read to make.
   *
   * `otherSections` exists for one sentence: an empty `Summary` over a
   * non-empty `Detailed` is a fact about the *switch*, not about the player,
   * and the empty state has to be able to tell those apart to name its own
   * cause.
   */
  const shownSections = useMemo(
    () => (data ? (pctDensity === 'summary' ? data.summary : data.sections) : []),
    [data, pctDensity],
  );
  const otherSections = useMemo(
    () => (data ? (pctDensity === 'summary' ? data.sections : data.summary) : []),
    [data, pctDensity],
  );

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
  }, [playerId, kind]);

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
          /* His club's next game rides on the page read now — see
             `NextGameBlock`, which fetched it itself and fetched it twice. */
          nextGame={page?.nextGame ?? null}
          nextGameLoading={pageRes.loading}
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
          updating={windowsBusy}
        />
      )}
      {tab === 'stats' && windows && (
        <PaneBusy busy={windowsBusy}>Reading the window table</PaneBusy>
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

      {/* **The card's own controls, and they sit outside it on purpose.**

          Two questions, and they are deliberately different kinds of control.
          The **cut** is which numbers the card is about, so it goes in the URL
          (`pcut=`) and re-reads; the **density** is how much of the same card
          this reader likes to see, so it is a saved preference and a render.
          The rules file draws that line and this is it applied: a link that
          leaves the cut out describes a different card, where one that leaves
          the density out describes the same card seen by somebody else.

          They are drawn above the card rather than inside its head because a
          cut can come back **empty** — a man with no plate appearance against
          left-handers has no rows to hang a control off — and an empty state
          has to name the control that caused it *and* leave that control
          reachable. Inside the head they would vanish with the card, and the
          only way back to the season would be the browser's Back button.

          Hidden entirely for a player Savant has no card for at all, which is
          `data.cut == null && sections.length === 0`: the season read came back
          empty, so there is nothing for a cut to be a cut of. That test is why
          `cut` rides on the response — the two empties are indistinguishable
          from the rows alone. */}
      {tab === 'percentiles' && data && !(data.cut == null && data.sections.length === 0) && (
        <div className="pct-controls">
          {/* **The density reads first, and it is a row of its own.**

              It sat beside the cuts, which put the reader's *second* question
              ahead of nothing and left a six-pill run and a two-pill run
              competing for one line. How much of the card you want is the
              coarser choice — it is true of every cut — so it leads, and the
              cuts sit under it as a set of what that card can be about. */}
          <div className="split-switch pct-density" role="tablist" aria-label="Density">
            {PERCENTILE_DENSITIES.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={pctDensity === d}
                className={`split-tab${pctDensity === d ? ' active' : ''}`}
                onClick={() => onPctDensityChange(d)}
                title={
                  d === 'summary'
                    ? 'Savant’s own card — the fifteen bars its player page draws'
                    : 'Every row this app ranks, grouped'
                }
              >
                {d === 'summary' ? 'Summary' : 'Detailed'}
              </button>
            ))}
          </div>

          {/* **The cuts, in the groups they actually fall into**, rather than as
              one run of six pills that wrapped and stranded the last one.
              `Season · Last 100 AB` is *which span*, the two hands are *which
              arm*, and `Home · Away` is *which park* — three questions, and a
              reader looking for the platoon split can now find it without
              reading all six.

              They remain **one selection**: only ever one pill is lit across the
              three groups, which is what says the six are alternatives rather
              than three independent settings. Grouped `.split-switch`es are the
              board's own language for exactly this — its bar sets the span and
              the position in two boxes that are read as one sentence. */}
          <div className="pct-cuts" role="tablist" aria-label="Which cut of the season">
            {CUT_GROUPS.map((group) => (
              <div className="split-switch" key={group.key}>
                {group.cuts.map((c) => (
                  <button
                    key={c ?? 'all'}
                    type="button"
                    role="tab"
                    aria-selected={pctCut === c}
                    className={`split-tab${pctCut === c ? ' active' : ''}`}
                    onClick={() => onPctCutChange(c)}
                    title={
                      c === null
                        ? 'His whole season — the only card whose bars are Savant’s own'
                        : `What he did ${cutOf(c, kind)}, placed among every qualified player’s full season`
                    }
                  >
                    {c === null ? 'Season' : CUT_LABEL[c][kind]}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* **And one dropdown where three boxes will not fit.** Below 560 the
              three groups take three lines of a card that is already the whole
              screen; a `select` is one line and the same six choices. It is the
              swap the board's own bar makes at 640 for its span and position
              runs, and for the same reason — eleven pills behind a horizontal
              scroll is a control you have to drag through to find `SS`.

              The density stays a switch at every width: two pills fit anywhere,
              and a `select` holding two options is a control that hides one of
              them behind a press. */}
          <label className="pct-cut-select">
            <span className="sr-only">Which cut of the season</span>
            <select
              value={pctCut ?? 'all'}
              onChange={(e) =>
                onPctCutChange(e.target.value === 'all' ? null : (e.target.value as PlayerCut))
              }
            >
              <option value="all">Season</option>
              {PLAYER_CUTS.map((c) => (
                <option key={c} value={c}>
                  {CUT_LABEL[c][kind]}
                </option>
              ))}
            </select>
          </label>
          <span
            className={`pct-updating${pctBusy ? '' : ' is-idle'}`}
            role="status"
            aria-label={pctBusy ? 'Updating' : undefined}
          >
            <SpinningBaseball size="sm" />
          </span>
        </div>
      )}

      {/* **A block wait only when there is nothing to show yet.** Gated on
          `!data`, which is what makes changing the cut quiet: the card that is
          up stays up while the next one is in flight and the `Updating` badge
          in its head carries the tense. Without that gate, every press of a cut
          pill blanked a full-height card for the length of a request — a
          re-read painting over an answer, which is the one thing the loading
          rules forbid outright. */}
      {tab === 'percentiles' && pctWait && !data && (
        <LoadingBlock>Reading the percentile card</LoadingBlock>
      )}
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
          names the control that answers it.

          **A failed *cut* leaves the card that was on screen standing** and
          says so beside it rather than replacing it, which is the same rule the
          wait above follows: the reader has an answer worth keeping, and the
          one that failed is a question they asked on top of it. */}
      {tab === 'percentiles' && error && !loading && (
        <div className="details-status details-error">
          {data
            ? `Couldn’t read the ${pctCut ? CUT_LABEL[pctCut][kind] : 'season'} card: ${error}. The card below is the last one that answered — press a split again to retry.`
            : `Couldn’t read the percentile card: ${error}. That is this read failing rather than anything about ${name} — leave the tab and come back to try it again.`}
        </div>
      )}
      {/* **And the unmissable half of the same statement.** The badge above is a
          20px slot beside a heading — a mark for somebody already looking for
          one — and this read is p50 811ms, p90 4,616ms and max 12,175ms in
          production. `useBusyMark` is what keeps it honest at the other end: a
          card the server already has comes back inside `WAIT_DELAY` and draws
          nothing at all. */}
      {tab === 'percentiles' && data && (
        <PaneBusy busy={pctBusy}>Reading the percentile card</PaneBusy>
      )}
      {tab === 'percentiles' && data && shownSections.length > 0 && (
        <div className="pct-card" ref={cardRef}>
          <div className="pct-card-head">
            <span className="pct-card-title">
              {data.year} MLB Percentile Rankings
              {/* **The cut is one unbreakable phrase.** On a phone the title
                  wraps, and left as plain text it broke *inside* the cut —
                  `— vs` on one line and `LHP` on the next, which reads as two
                  half-thoughts. Nowrap moves the break to the space before the
                  dash, where a title should break. */}
              {data.cut && (
                <span className="pct-card-cut"> — {CUT_LABEL[data.cut][kind]}</span>
              )}
            </span>
          </div>
          {/* **What a cut card is, said once, above the bars.** Three things a
              reader cannot get from the bars themselves and would otherwise
              have to assume: that the population is the *whole season* (which
              is what makes a split comparable to anything), that these ranks
              are ours rather than Savant's (which is what the broken bubbles
              mean), and how much of a season the line rests on — the last being
              the only guard against reading a hundredth percentile off
              thirty-four plate appearances. */}
          {data.cut && (
            <p className="pct-cut-note">
              {data.cutSample != null && (
                <>
                  <span className="pct-cut-sample">
                    {data.cutSample} {sampleUnit(isPitcher, data.cutSample)}
                  </span>
                  {', '}
                </>
              )}
              placed among every qualified player’s <strong>full season</strong> — so these ranks
              are ours rather than Savant’s, and every bubble is drawn broken.
            </p>
          )}
          {shownSections.map((sec) => (
            <div className="pct-section" key={sec.title}>
              <h2 className="pct-section-title">{sec.title}</h2>
              {renderMetricRows(sec.metrics, overlapPct)}
            </div>
          ))}
        </div>
      )}
      {/* **A card that came back empty, which is a real answer**, and there are
          now three ways to reach one — so the sentence names which.

          The **cut** is empty: he has no plate appearance in it. Common and
          unremarkable (a left-handed platoon bat against left-handers), and the
          control that caused it is the row of pills above, still on screen.

          The **density** is empty and the other one is not: he has a line but
          nothing in the fifteen bars Savant draws — a handful of plate
          appearances with no batted ball among them. Rare, and it names the
          switch rather than the player.

          The **season** is empty: Savant has no major-league Statcast for him
          of this kind — measured on a prospect a fantasy league has rostered
          (Kade Anderson, whose pitching page carries no `statcast:` payload at
          all) and on a batter asked for a pitcher's card. It says what the
          Overview tab says two tabs over, in the same words, because it is the
          same fact; the pitcher's wording narrows it to the half this card is
          about, a man who has only ever batted having appeared.

          None of the three is drawn inside `.pct-card`, where the first used to
          sit under a heading reading `2026 MLB Percentile Rankings` — a title
          over a card with no rankings in it. */}
      {tab === 'percentiles' && data && !loading && shownSections.length === 0 && (
        <div className="details-status">
          {data.cut
            ? `${name} has no ${CUT_LABEL[data.cut][kind]} line this season — nothing to rank. Pick another split above.`
            : otherSections.length > 0
              ? `Nothing of ${name}’s season lands in Savant’s own fifteen bars — switch to Detailed above for the rows he does have.`
              : isPitcher
                ? `${name} has not pitched in a major-league game this season, so there is nothing to rank him against.`
                : `${name} has not appeared in a major-league game this season, so there is nothing to rank him against.`}
        </div>
      )}
    </DetailsShell>
  );
}
